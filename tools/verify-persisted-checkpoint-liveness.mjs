#!/usr/bin/env node
/**
 * Browser-backed liveness certification for durable campaign checkpoints.
 *
 * This gate deliberately uses three boundaries instead of trusting one:
 *
 *  1. a public story API writes the checkpoint into the real Campaign store;
 *  2. a browser reload proves the exact localStorage payload survives and is
 *     accepted by Campaign normalization;
 *  3. the canonical (non-preview) scene boots that payload and one production
 *     action handler, input path, or authored automatic transition advances.
 *
 * Calling the production handler directly is intentional for distant look-at
 * targets. The receipt separately records that the target's real descriptor
 * was enabled. Full path traversal belongs to semantic smoke; this verifier's
 * seam is checkpoint reconstruction -> live runtime action.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  SCENE_IDS,
} from '../src/core/campaign.js';
import {
  evaluateMissionLiveness,
  MISSION_LIVENESS_STATUS,
} from '../src/core/mission-liveness.js';
import { closeEvidenceLifecycle, listenEvidenceServer } from './evidence-lifecycle.mjs';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = Number(process.env.PERSISTED_LIVENESS_TIMEOUT_MS) || 120_000;
const RECEIPT_SCHEMA = 'squatchsmash.persisted-checkpoint-liveness.v1';

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
});

function checkpointSpec(id, family, sceneId, checkpoint, href, witness) {
  return Object.freeze({ id, family, sceneId, checkpoint, href, witness });
}

/** The exact durable checkpoint inventory this first live gate owns. */
export const PERSISTED_LIVENESS_SPECS = Object.freeze([
  checkpointSpec('no_wake:dock', 'no_wake', SCENE_IDS.NO_WAKE,
    'dock', '/nowake.html', 'board_boat'),
  checkpointSpec('no_wake:underway', 'no_wake', SCENE_IDS.NO_WAKE,
    'underway', '/nowake.html', 'advance_throttle'),
  checkpointSpec('no_wake:open_water', 'no_wake', SCENE_IDS.NO_WAKE,
    'open_water', '/nowake.html', 'go_below'),
  checkpointSpec('no_wake:execution', 'no_wake', SCENE_IDS.NO_WAKE,
    'execution', '/nowake.html', 'begin_wrap'),
  checkpointSpec('no_wake:weighted', 'no_wake', SCENE_IDS.NO_WAKE,
    'weighted', '/nowake.html', 'dump_body'),
  checkpointSpec('hotdog:party', 'hotdog', SCENE_IDS.BADA_BING_TWO,
    'party', '/bing.html?visit=2', 'start_performance'),
  checkpointSpec('hotdog:attack', 'hotdog', SCENE_IDS.BADA_BING_TWO,
    'attack', '/bing.html?visit=2', 'start_cleanup'),
  checkpointSpec('hotdog:cleanup', 'hotdog', SCENE_IDS.BADA_BING_TWO,
    'cleanup', '/bing.html?visit=2', 'continue_cleanup'),
  checkpointSpec('hotdog:graveyard', 'hotdog', SCENE_IDS.SQUATCH_GRAVEYARD,
    'graveyard', '/graveyard.html', 'pickup_body'),
]);

export function validatePersistedLivenessSpecs(specs = PERSISTED_LIVENESS_SPECS) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new TypeError('persisted liveness requires a non-empty checkpoint inventory');
  }
  const ids = new Set();
  const states = new Set();
  for (const spec of specs) {
    for (const field of ['id', 'family', 'sceneId', 'checkpoint', 'href', 'witness']) {
      if (typeof spec?.[field] !== 'string' || spec[field].trim() === '') {
        throw new TypeError(`persisted liveness spec requires ${field}`);
      }
    }
    if (ids.has(spec.id)) throw new TypeError(`duplicate persisted liveness id: ${spec.id}`);
    ids.add(spec.id);
    const state = `${spec.sceneId}\u0000${spec.checkpoint}`;
    if (states.has(state)) {
      throw new TypeError(
        `duplicate persisted liveness state: ${spec.sceneId}/${spec.checkpoint}`,
      );
    }
    states.add(state);
    const url = new URL(spec.href, 'http://checkpoint.invalid');
    if (url.searchParams.get('preview') === '1') {
      throw new TypeError(`${spec.id} may not certify a preview URL`);
    }
  }
  return true;
}

function failure(code, message) {
  return Object.freeze({ code, message });
}

/**
 * Validate a browser receipt without needing a browser. This is used by the
 * unit suite and keeps the live runner's acceptance rules explicit.
 */
export function evaluatePersistedLivenessReceipt(spec, receipt) {
  const failures = [];
  if (!receipt || typeof receipt !== 'object') {
    return Object.freeze({
      status: MISSION_LIVENESS_STATUS.FAIL,
      ok: false,
      failures: Object.freeze([failure('RECEIPT_MISSING', 'browser receipt is missing')]),
      liveness: null,
    });
  }
  if (receipt.schema !== RECEIPT_SCHEMA) {
    failures.push(failure('SCHEMA_MISMATCH', `expected ${RECEIPT_SCHEMA}`));
  }
  if (receipt.id !== spec.id) failures.push(failure('ID_MISMATCH', `expected ${spec.id}`));
  if (receipt.seeded?.checkpoint !== spec.checkpoint) {
    failures.push(failure('SEED_CHECKPOINT_MISMATCH', `seed did not write ${spec.checkpoint}`));
  }
  if (typeof receipt.seeded?.raw !== 'string' || receipt.seeded.raw.length === 0) {
    failures.push(failure('SEED_NOT_PERSISTED', 'public story did not write campaign localStorage'));
  }
  if (receipt.reloaded?.raw !== receipt.seeded?.raw) {
    failures.push(failure('RELOAD_BYTES_CHANGED', 'campaign bytes changed across the seed-page reload'));
  }
  if (receipt.reloaded?.checkpoint !== spec.checkpoint) {
    failures.push(failure(
      'RELOAD_CHECKPOINT_MISMATCH',
      `Campaign normalization restored ${receipt.reloaded?.checkpoint ?? 'null'}, expected ${spec.checkpoint}`,
    ));
  }
  if (receipt.runtime?.checkpoint !== spec.checkpoint) {
    failures.push(failure(
      'RUNTIME_CHECKPOINT_MISMATCH',
      `canonical runtime read ${receipt.runtime?.checkpoint ?? 'null'}, expected ${spec.checkpoint}`,
    ));
  }
  if (receipt.runtime?.sceneId !== spec.sceneId) {
    failures.push(failure(
      'RUNTIME_SCENE_MISMATCH',
      `canonical runtime read ${receipt.runtime?.sceneId ?? 'null'}, expected ${spec.sceneId}`,
    ));
  }
  const runtimeUrl = new URL(receipt.runtime?.url ?? 'http://checkpoint.invalid');
  if (runtimeUrl.searchParams.get('preview') === '1') {
    failures.push(failure('PREVIEW_RUNTIME', 'a preview page cannot certify durable restoration'));
  }
  if (receipt.runtime?.ready !== true) {
    failures.push(failure('RUNTIME_NOT_READY', 'canonical runtime did not become playable'));
  }
  if (Array.isArray(receipt.runtime?.errors) && receipt.runtime.errors.length > 0) {
    /* Say WHAT it threw. A gate that reports "1 page error" and not the
     * message costs the reader a second run with their own listener attached
     * before they can start on the actual bug. */
    failures.push(failure(
      'RUNTIME_ERRORS',
      `canonical runtime emitted ${receipt.runtime.errors.length} page error(s): `
        + receipt.runtime.errors.map((message) => String(message).split('\n')[0]).join(' | '),
    ));
  }
  if (receipt.witness?.id !== spec.witness || receipt.witness?.attempted !== true) {
    failures.push(failure('WITNESS_MISSING', `progress witness ${spec.witness} was not attempted`));
  }
  if (receipt.witness?.accepted !== true) {
    failures.push(failure('WITNESS_REFUSED', `progress witness ${spec.witness} did not advance`));
  }
  if (receipt.witness?.changed !== true) {
    failures.push(failure('WITNESS_NO_CHANGE', `progress witness ${spec.witness} changed no runtime fact`));
  }

  let liveness = null;
  try {
    liveness = evaluateMissionLiveness(receipt.observation);
    if (liveness.status !== MISSION_LIVENESS_STATUS.PASS) {
      failures.push(failure(
        'LIVENESS_NOT_PROVEN',
        `shared mission-liveness evaluator returned ${liveness.status}`,
      ));
    }
  } catch (error) {
    failures.push(failure('OBSERVATION_INVALID', error.message));
  }

  return Object.freeze({
    status: failures.length ? MISSION_LIVENESS_STATUS.FAIL : MISSION_LIVENESS_STATUS.PASS,
    ok: failures.length === 0,
    failures: Object.freeze(failures),
    liveness,
  });
}

function createStaticServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? HOST}`);
      if (url.pathname === '/__persisted_liveness_seed.html') {
        const body = '<!doctype html><meta charset="utf-8"><title>Checkpoint seed</title>';
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body),
          'content-type': 'text/html; charset=utf-8',
        }).end(body);
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(ROOT, relative);
      if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const stat = await fsp.stat(file).catch(() => null);
      if (!stat?.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': stat.size,
        'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()]
          ?? 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
}

/** Seed through the public story interfaces, never by assigning checkpoint. */
async function seedPublicCheckpoint(page, spec) {
  return page.evaluate(async ({ family, checkpoint, storageKey }) => {
    localStorage.clear();
    const campaignModule = await import('/src/core/campaign.js');
    const {
      EVENT_IDS,
      MISSION_IDS: M,
      NO_WAKE_CHECKPOINT_IDS,
      SCENE_IDS: S,
      createCampaign,
    } = campaignModule;
    const ensure = (value, label) => {
      if (!value) throw new Error(`checkpoint seed refused: ${label}`);
      return value;
    };
    const campaign = createCampaign();
    ensure(campaign.persistent, 'Campaign did not acquire browser localStorage');

    if (family === 'no_wake') {
      /* BEAT 18 MOVED, AND THIS SEED DID NOT FOLLOW IT.
       *
       * NO WAKE used to be the first thing off the back of the Motel, on Day
       * 3, with the date still ahead of him -- so this seeded `chapter:
       * 'no_wake'`, Day 3, and never touched the Silver Room. The beats 12-19
       * reorder made it the afternoon of Day 7, after the stayover, and
       * `canBegin()` grew a `silver_incomplete` refusal to say so. This seed
       * kept building the old world, so `begin()` refused every time and all
       * five checkpoints failed against a scene the campaign marathon walks
       * without complaint. `no_wake` is also one of the three chapters the
       * schema-21 migration strands, which is the second reason it could not
       * stand. Mirrors `readyCampaign()` in tests/no-wake-story.test.mjs; the
       * two must move together. */
      campaign.update((state) => {
        state.story.chapter = 'luxury_apartment';
        state.story.day = 7;
        state.story.timeMinutes = 12 * 60 + 45;
        state.scene = { id: S.NO_WAKE, spawn: 'gate_c' };
        state.missions[M.JERKY_MOTEL].status = 'complete';
        state.missions[M.SILVER_ROOM].status = 'complete';
        state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
        state.missions[M.NO_WAKE].status = 'available';
      });
      const { createNoWakeStory } = await import('/src/core/no-wake-story.js');
      const story = createNoWakeStory({ campaign });
      const begun = story.begin();
      ensure(begun?.ok === true, 'NO WAKE begin');
      for (const id of NO_WAKE_CHECKPOINT_IDS) {
        if (id === 'dock') {
          if (checkpoint === id) break;
          continue;
        }
        if (id === 'returned') break;
        ensure(story.checkpoint(id), `NO WAKE ${id}`);
        if (checkpoint === id) break;
      }
      campaign.enter(S.NO_WAKE, { spawn: 'gate_c' });
    } else if (family === 'hotdog') {
      campaign.update((state) => {
        state.story.chapter = 'bada_bing_two';
        state.story.day = 2;
        state.story.timeMinutes = 23 * 60;
        state.missions[M.AIRSTRIP_SMUGGLING].status = 'complete';
        state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
        state.missions[M.BADA_BING_TWO].status = 'available';
      });
      campaign.enter(S.BADA_BING_TWO, { spawn: 'club_entrance' });
      const { createBadaBingTwoStory } = await import('/src/core/bada-bing-two-story.js');
      const story = createBadaBingTwoStory({ campaign });
      ensure(story.begin()?.ok === true, 'HotDog begin');
      if (checkpoint !== 'party') {
        ensure(story.recordAttack({ attackResolved: true }), 'HotDog attack result');
      }
      if (checkpoint === 'cleanup') {
        ensure(story.recordCleanup('bathrooms'), 'HotDog first cleanup task');
      }
      if (checkpoint === 'graveyard') {
        for (const task of ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep']) {
          ensure(story.recordCleanup(task), `HotDog cleanup ${task}`);
        }
        ensure(story.completeClub({
          assignment: 'reserve_pickup',
          bodyWrapped: true,
          bodyLoaded: true,
        }), 'HotDog club completion');
        campaign.enter(S.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
        const { createGraveyardStory } = await import('/src/core/graveyard-story.js');
        ensure(createGraveyardStory({ campaign }).begin()?.ok === true, 'Graveyard begin');
      }
    } else {
      throw new Error(`unknown checkpoint family: ${family}`);
    }

    const state = campaign.state;
    const raw = localStorage.getItem(storageKey);
    return {
      raw,
      checkpoint: family === 'no_wake'
        ? state.missions[M.NO_WAKE].checkpoint
        : state.missions[M.BADA_BING_TWO].checkpoint,
      sceneId: state.scene.id,
      persistent: campaign.persistent,
    };
  }, { family: spec.family, checkpoint: spec.checkpoint, storageKey: CAMPAIGN_STORAGE_KEY });
}

async function readReloadedCheckpoint(page, spec) {
  return page.evaluate(async ({ family, storageKey }) => {
    const { MISSION_IDS: M, createCampaign } = await import('/src/core/campaign.js');
    const campaign = createCampaign();
    const state = campaign.state;
    return {
      raw: localStorage.getItem(storageKey),
      checkpoint: family === 'no_wake'
        ? state.missions[M.NO_WAKE].checkpoint
        : state.missions[M.BADA_BING_TWO].checkpoint,
      sceneId: state.scene.id,
      persistent: campaign.persistent,
    };
  }, { family: spec.family, storageKey: CAMPAIGN_STORAGE_KEY });
}

async function noWakeWitness(page, spec) {
  if (spec.witness === 'board_boat') {
    const before = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      boarded: window.NO_WAKE.state.boarded,
    }));
    const action = await page.evaluate(() => {
      const runtime = window.NO_WAKE;
      const target = runtime.boat.targets.board;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      const returned = enabled ? descriptor.onUse?.(target) : false;
      return { enabled, returned: returned !== false };
    });
    await page.waitForFunction(() => window.NO_WAKE.state.boarded === true);
    const after = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      boarded: window.NO_WAKE.state.boarded,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && action.returned && after.boarded,
      changed: before.boarded !== after.boarded || before.phase !== after.phase,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler',
    };
  }

  if (spec.witness === 'advance_throttle') {
    await page.waitForFunction(() => window.NO_WAKE.state.atHelm
      && window.NO_WAKE.state.phase === 'drive');
    const before = await page.evaluate(() => ({
      throttle: window.NO_WAKE.physics.throttle,
      distance: window.NO_WAKE.physics.distance,
    }));
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => ({
      throttle: window.NO_WAKE.physics.throttle,
      distance: window.NO_WAKE.physics.distance,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: after.throttle > before.throttle || after.distance > before.distance,
      changed: after.throttle !== before.throttle || after.distance !== before.distance,
      before,
      after,
      enabledSubjectCount: 1,
      mode: 'real_keyboard_input',
    };
  }

  if (spec.witness === 'go_below') {
    await page.waitForFunction(() => window.NO_WAKE.state.phase === 'descend', null, {
      timeout: 30_000,
    });
    const before = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      below: window.NO_WAKE.state.below,
    }));
    const action = await page.evaluate(() => {
      const runtime = window.NO_WAKE;
      const target = runtime.boat.targets.companionway;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      return { enabled, returned: enabled ? descriptor.onUse?.(target) !== false : false };
    });
    await page.waitForFunction(() => window.NO_WAKE.state.below === true);
    const after = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      below: window.NO_WAKE.state.below,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && action.returned && after.below,
      changed: before.below !== after.below || before.phase !== after.phase,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler',
    };
  }

  if (spec.witness === 'begin_wrap') {
    await page.waitForFunction(() => window.NO_WAKE.state.wrapStage === 'roll', null, {
      timeout: 30_000,
    });
    const before = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      wrapStage: window.NO_WAKE.state.wrapStage,
    }));
    const action = await page.evaluate(() => {
      const runtime = window.NO_WAKE;
      const target = runtime.boat.targets.body;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      if (enabled) descriptor.onUse?.(target);
      return { enabled };
    });
    const after = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      wrapStage: window.NO_WAKE.state.wrapStage,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && after.wrapStage === 'fold',
      changed: before.wrapStage !== after.wrapStage,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler',
    };
  }

  if (spec.witness === 'dump_body') {
    /* The carry is 13.3 seconds of authored simulation. Software WebGL can
     * render fewer than one frame per second on CI, turning a healthy timed
     * transition into a wall-clock timeout. Keep the production RAF/update
     * path and timing intact; omit only rasterisation, which this liveness
     * gate neither observes nor certifies. */
    await page.evaluate(() => {
      const postfx = window.NO_WAKE?.postfx;
      if (postfx) postfx.render = () => {};
    });
    await page.waitForFunction(() => window.NO_WAKE.state.phase === 'platform', null, {
      timeout: 90_000,
    });
    await page.waitForFunction(() => {
      const target = window.NO_WAKE.boat.targets.disposal;
      const descriptor = target?.userData?.interact;
      return Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
    }, null, { timeout: 15_000 });
    const before = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      disposed: window.NO_WAKE.state.bodyDisposed,
    }));
    const action = await page.evaluate(() => {
      const runtime = window.NO_WAKE;
      const target = runtime.boat.targets.disposal;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      if (enabled) descriptor.onUse?.(target);
      return { enabled };
    });
    const after = await page.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      disposed: window.NO_WAKE.state.bodyDisposed,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && after.disposed && after.phase === 'dispose',
      changed: before.disposed !== after.disposed || before.phase !== after.phase,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler_after_authored_transition',
    };
  }
  throw new Error(`unknown NO WAKE witness: ${spec.witness}`);
}

async function hotDogWitness(page, spec) {
  if (spec.witness === 'start_performance') {
    await page.waitForFunction(() => window.HOTDOG_INCIDENT?.mission?.state === 'party');
    const before = await page.evaluate(() => ({
      mission: window.HOTDOG_INCIDENT.mission.state,
      director: window.HOTDOG_INCIDENT.state.director.running,
    }));
    const action = await page.evaluate(() => {
      const runtime = window.HOTDOG_INCIDENT;
      const target = runtime.party.stage.controls;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      if (enabled) descriptor.onUse?.(target);
      return { enabled };
    });
    const after = await page.evaluate(() => ({
      mission: window.HOTDOG_INCIDENT.mission.state,
      director: window.HOTDOG_INCIDENT.state.director.running,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && after.mission === 'performance' && after.director,
      changed: before.mission !== after.mission || before.director !== after.director,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler',
    };
  }

  const cleanupTarget = spec.witness === 'start_cleanup' ? 'bathrooms' : 'cleaning_kit';
  if (spec.witness === 'start_cleanup' || spec.witness === 'continue_cleanup') {
    await page.waitForFunction(() => window.HOTDOG_INCIDENT?.mission?.state === 'cleanup');
    const before = await page.evaluate(() => ({
      mission: window.HOTDOG_INCIDENT.mission.state,
      tasks: [...window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two.cleanupTasks],
    }));
    const action = await page.evaluate((targetId) => {
      const runtime = window.HOTDOG_INCIDENT;
      const target = targetId === 'bathrooms'
        ? runtime.party.cleanup.bathroomPads.mens
        : runtime.party.cleanup.kit;
      const descriptor = target?.userData?.interact;
      const enabled = Boolean(descriptor && (!descriptor.enabled || descriptor.enabled()));
      if (enabled) descriptor.onUse?.(target);
      return { enabled };
    }, cleanupTarget);
    const after = await page.evaluate(() => ({
      mission: window.HOTDOG_INCIDENT.mission.state,
      tasks: [...window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two.cleanupTasks],
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: action.enabled && after.tasks.includes(cleanupTarget),
      changed: after.tasks.length > before.tasks.length,
      before,
      after,
      enabledSubjectCount: action.enabled ? 1 : 0,
      mode: 'production_interaction_handler',
    };
  }

  if (spec.witness === 'pickup_body') {
    await page.waitForFunction(() => window.GRAVEYARD?.mission?.state === 'arrival');
    const before = await page.evaluate(() => ({
      mission: window.GRAVEYARD.mission.state,
      bodyPhase: window.GRAVEYARD.bodyPresentation().phase,
    }));
    const accepted = await page.evaluate(() => window.GRAVEYARD.pickupBody());
    const after = await page.evaluate(() => ({
      mission: window.GRAVEYARD.mission.state,
      bodyPhase: window.GRAVEYARD.bodyPresentation().phase,
    }));
    return {
      id: spec.witness,
      attempted: true,
      accepted: accepted === true && after.mission === 'carried'
        && after.bodyPhase === 'carrying',
      changed: before.mission !== after.mission || before.bodyPhase !== after.bodyPhase,
      before,
      after,
      enabledSubjectCount: 1,
      mode: 'production_runtime_handler',
    };
  }
  throw new Error(`unknown HotDog witness: ${spec.witness}`);
}

async function runtimeMetadata(page, spec, errors) {
  return page.evaluate(({ family, checkpoint, storageKey, runtimeErrors }) => {
    const hotDogScene = checkpoint === 'graveyard' ? window.GRAVEYARD : window.HOTDOG_INCIDENT;
    const runtime = family === 'no_wake' ? window.NO_WAKE : hotDogScene;
    const state = runtime?.campaignState;
    const mission = family === 'no_wake'
      ? state?.missions?.no_wake
      : state?.missions?.bada_bing_two;
    return {
      url: location.href,
      ready: family === 'no_wake'
        ? Boolean(document.body.classList.contains('playing') && runtime?.player?.enabled)
        : checkpoint === 'graveyard'
          ? Boolean(runtime?.phase === 'active' && runtime?.player?.enabled)
          : Boolean(runtime?.game?.started && runtime?.game?.phase === 'active'),
      checkpoint: mission?.checkpoint ?? null,
      sceneId: state?.scene?.id ?? null,
      persistedRawPresent: localStorage.getItem(storageKey) !== null,
      errors: runtimeErrors,
    };
  }, {
    family: spec.family,
    checkpoint: spec.checkpoint,
    storageKey: CAMPAIGN_STORAGE_KEY,
    runtimeErrors: errors,
  });
}

async function runOne(page, origin, spec) {
  const errors = [];
  let seeded = null;
  let reloaded = null;
  let runtime = null;
  const onPageError = (error) => errors.push(error.message);
  page.on('pageerror', onPageError);
  try {
    await page.goto(`${origin}/__persisted_liveness_seed.html`, { waitUntil: 'load' });
    seeded = await seedPublicCheckpoint(page, spec);
    await page.reload({ waitUntil: 'load' });
    reloaded = await readReloadedCheckpoint(page, spec);

    await page.goto(`${origin}${spec.href}`, { waitUntil: 'load' });
    if (spec.family === 'no_wake') {
      await page.waitForFunction(() => Boolean(window.NO_WAKE?.story));
    } else if (spec.checkpoint === 'graveyard') {
      await page.waitForFunction(() => Boolean(window.GRAVEYARD?.story));
    } else {
      await page.waitForFunction(() => Boolean(window.HOTDOG_INCIDENT?.story));
    }
    const start = page.locator('#start-btn');
    await start.click();
    if (spec.family === 'no_wake') {
      await page.waitForFunction(() => document.body.classList.contains('playing')
        && window.NO_WAKE?.player?.enabled);
    } else if (spec.checkpoint === 'graveyard') {
      await page.waitForFunction(() => window.GRAVEYARD?.phase === 'active'
        && window.GRAVEYARD?.player?.enabled);
    } else {
      await page.waitForFunction(() => window.HOTDOG_INCIDENT?.game?.started
        && window.HOTDOG_INCIDENT?.game?.phase === 'active');
    }

    runtime = await runtimeMetadata(page, spec, errors);
    const witness = spec.family === 'no_wake'
      ? await noWakeWitness(page, spec)
      : await hotDogWitness(page, spec);
    const observation = {
      sceneId: spec.sceneId,
      phase: String(witness.after?.phase ?? witness.after?.mission ?? 'restored'),
      checkpoint: spec.checkpoint,
      terminal: false,
      pendingAutomaticTransition: false,
      progressActions: [{
        id: spec.witness,
        label: spec.witness.replaceAll('_', ' '),
        enabled: witness.enabledSubjectCount > 0,
        reachable: witness.accepted === true && witness.changed === true,
      }],
    };
    const receipt = {
      schema: RECEIPT_SCHEMA,
      id: spec.id,
      seeded,
      reloaded,
      runtime,
      witness,
      observation,
    };
    return { spec, receipt, evaluation: evaluatePersistedLivenessReceipt(spec, receipt) };
  } catch (error) {
    // Preserve every boundary already proven. A late witness timeout must not
    // be misreported as a missing seed, changed reload bytes, or wrong scene.
    error.persistedLivenessPartial = { seeded, reloaded, runtime };
    throw error;
  } finally {
    page.off('pageerror', onPageError);
  }
}

export async function runPersistedCheckpointLiveness({
  specs = PERSISTED_LIVENESS_SPECS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  validatePersistedLivenessSpecs(specs);
  const server = createStaticServer();
  let browser = null;
  try {
    await listenEvidenceServer(server, 0, HOST);
    const address = server.address();
    const origin = `http://${HOST}:${address.port}`;
    browser = await launchChromium({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const results = [];
    for (const spec of specs) {
      try {
        results.push(await runOne(page, origin, spec));
      } catch (error) {
        const partial = error.persistedLivenessPartial ?? {};
        const receipt = {
          schema: RECEIPT_SCHEMA,
          id: spec.id,
          seeded: partial.seeded ?? null,
          reloaded: partial.reloaded ?? null,
          runtime: {
            ...(partial.runtime ?? {}),
            errors: [...(partial.runtime?.errors ?? []), error.message],
          },
          witness: null,
          observation: null,
        };
        results.push({
          spec,
          receipt,
          error: error.message,
          evaluation: evaluatePersistedLivenessReceipt(spec, receipt),
        });
      }
    }
    await context.close();
    const counts = {
      total: results.length,
      PASS: results.filter(({ evaluation }) => evaluation.ok).length,
      FAIL: results.filter(({ evaluation }) => !evaluation.ok).length,
    };
    return Object.freeze({
      schema: 'squatchsmash.persisted-checkpoint-liveness-run.v1',
      ok: counts.FAIL === 0 && counts.total > 0,
      counts: Object.freeze(counts),
      results: Object.freeze(results),
    });
  } finally {
    await closeEvidenceLifecycle({ browser, server });
  }
}

function parseArguments(argv) {
  const options = { ids: [], json: false, list: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--list') options.list = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--case') options.ids.push(argv[++index]);
    else if (argument.startsWith('--case=')) options.ids.push(argument.slice('--case='.length));
    else throw new TypeError(`unknown option: ${argument}`);
  }
  if (options.ids.some((id) => !id)) throw new TypeError('--case requires an id');
  return options;
}

function usage() {
  return [
    'Usage: node tools/verify-persisted-checkpoint-liveness.mjs [options]',
    '',
    '  --case <id>   run one or more exact checkpoint ids',
    '  --list        list checkpoint ids without launching a browser',
    '  --json        print the complete machine-readable receipt',
  ].join('\n');
}

function printHuman(report) {
  console.log(
    `Persisted checkpoint liveness: ${report.ok ? 'PASS' : 'FAIL'} `
      + `(${report.counts.PASS} PASS, ${report.counts.FAIL} FAIL; ${report.counts.total} total)`,
  );
  for (const result of report.results) {
    const { spec, evaluation, witness } = {
      ...result,
      witness: result.receipt?.witness,
    };
    console.log(
      `  ${evaluation.ok ? 'PASS' : 'FAIL'} ${spec.id}`
      + `${witness?.mode ? ` [${witness.mode}]` : ''}`,
    );
    for (const item of evaluation.failures) console.log(`    ${item.code}: ${item.message}`);
    if (result.error) console.log(`    ERROR: ${result.error}`);
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else if (options.list) {
      for (const spec of PERSISTED_LIVENESS_SPECS) console.log(spec.id);
    } else {
      const unknown = options.ids.filter((id) => (
        !PERSISTED_LIVENESS_SPECS.some((spec) => spec.id === id)
      ));
      if (unknown.length) throw new Error(`unknown checkpoint case(s): ${unknown.join(', ')}`);
      const specs = options.ids.length
        ? PERSISTED_LIVENESS_SPECS.filter((spec) => options.ids.includes(spec.id))
        : PERSISTED_LIVENESS_SPECS;
      const report = await runPersistedCheckpointLiveness({ specs });
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else printHuman(report);
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
