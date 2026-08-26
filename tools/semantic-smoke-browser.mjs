#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateSemanticSmokeRegistry } from '../src/core/scene-contract.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';
import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
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

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function establishDayTwo(campaign) {
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.story.timeMinutes = 20 * 60 + 15;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponDropped = true;
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].checkpoint = 'landed_home';
  });
}

function hotDogInputSeed() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  establishDayTwo(campaign);
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'driver_seat' });
  return JSON.stringify(campaign.state);
}

function graveyardInputSeed() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  establishDayTwo(campaign);
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'in_progress';
    incident.checkpoint = 'body_loaded';
    incident.assignment = 'reserve_pickup';
    incident.attackResolved = true;
    incident.cleanupTasks = ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep'];
    incident.bodyWrapped = true;
    incident.bodyLoaded = true;
  });
  campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD);
  return JSON.stringify(campaign.state);
}

function countrysideCabinInputSeed() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  /* Campaign#enter is the same direct-entry seam used by development pages.
   * The Cabin runtime gates Start on this registered scene id and retains the
   * authored arrival spawn; no preview query or test-only Player pose is
   * needed to exercise the production input path. */
  campaign.enter(SCENE_IDS.COUNTRYSIDE_CABIN, { spawn: 'arrival' });
  return JSON.stringify(campaign.state);
}

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
  const certification = game?.certification;
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
    camera: player ? {
      yaw: player.yaw,
      pitch: player.pitch,
      owner: certification?.cameraOwner ?? null,
      expectedOwner: 'core/player',
      poseAdapter: certification?.poseAdapter ?? null,
      identity: certification?.cameraIdentity ?? null,
      playerCameraIdentity: certification?.playerCameraIdentity ?? null,
    } : null,
    input: game?.inputReceipt ?? null,
    route: certification?.route ?? null,
    spawn: certification ? {
      requested: certification.requestedSpawn ?? null,
      effective: certification.effectiveSpawn ?? null,
      campaign: certification.campaignScene ?? null,
      legalActions: [...(certification.legalActions ?? [])],
    } : null,
    mission: certification ? {
      rideBeat: certification.rideBeat ?? null,
      ridePhase: certification.ridePhase ?? null,
      arrival: certification.arrival ?? null,
      handoff: certification.handoff ?? null,
      trailDistance: certification.trailDistance ?? null,
      trailRequiredDistance: certification.trailRequiredDistance ?? null,
    } : null,
    objective: {
      visible: Boolean(panel && !panel.classList.contains('hidden')
        && panelStyle?.display !== 'none'
        && panelStyle?.visibility !== 'hidden'),
      count: objectiveItems.length,
      text: objectiveItems,
      changeObserved: null,
      revision: certification?.objectiveRevision ?? null,
      runtimeText: certification?.objectiveText ?? null,
    },
    renderEvidence: {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      sceneChildren: game?.scene?.children?.length ?? null,
      renderedFrameCount: certification?.renderedFrameCount ?? null,
    },
    subjectCounts: {
      meaningful_frame: (certification?.renderedFrameCount ?? 0) > 0 ? 1 : 0,
      player: player ? 1 : 0,
      objective_item: objectiveItems.length,
      interactable: certification?.interactionTargetCount ?? null,
      authored_actor: Array.isArray(game?.cast?.all) ? game.cast.all.length : null,
    },
    progressionChanged: null,
    interactionInvoked: certification
      ? certification.interactionUseCount > 0
      : null,
    interaction: certification ? {
      currentId: certification.interactionCurrentId ?? null,
      targetCount: certification.interactionTargetCount ?? null,
      useCount: certification.interactionUseCount ?? null,
      lastUse: certification.lastInteractionUse ?? null,
    } : null,
  };
}

function specialMeetingAtCarDoor() {
  const game = window.SPECIAL_MEETING;
  const evidence = game?.certification;
  return Boolean(game?.started
    && evidence?.rideBeat === 'SM-110'
    && evidence?.interactionCurrentId === 'specialmeeting.front_passenger_door');
}

function specialMeetingCarDoorAvailable() {
  const game = window.SPECIAL_MEETING;
  const evidence = game?.certification;
  return Boolean(game?.started
    && evidence?.rideBeat === 'SM-110'
    && evidence?.interactionTargetCount >= 1);
}

function specialMeetingUsedCarDoor(previousUseCount) {
  const evidence = window.SPECIAL_MEETING?.certification;
  return Boolean(evidence
    && evidence.interactionUseCount > previousUseCount
    && evidence.poseAdapter === 'passenger_rig');
}

function specialMeetingObjectiveAdvanced(previousRevision) {
  const evidence = window.SPECIAL_MEETING?.certification;
  return Boolean(evidence
    && evidence.objectiveRevision > previousRevision
    && evidence.objectiveText === 'Ride out to the meeting.');
}

function selectSpecialMeetingSpurCheckpoint() {
  const game = window.SPECIAL_MEETING;
  if (!game?.campaign) throw new Error('Special Meeting campaign surface is unavailable');
  game.campaign.enter('special_meeting', { spawn: 'spur' });
  return { ...game.campaign.state.scene };
}

function hotDogBootReady() {
  return window.HOTDOG_INCIDENT?.game?.phase === 'active';
}

function hotDogReady() {
  const runtime = window.HOTDOG_INCIDENT;
  return Boolean(runtime?.game?.phase === 'active'
    && runtime?.input?.snapshot?.().enabled
    && document.pointerLockElement === document.querySelector('#scene'));
}

function hotDogMoved({ x, z, minimum, code }) {
  const player = window.HOTDOG_INCIDENT?.player;
  return Boolean(player?.enabled
    && player.mode === 'walk'
    && player.keys?.has(code)
    && Math.hypot(player.position.x - x, player.position.z - z) > minimum);
}

function observeHotDogInput() {
  const runtime = window.HOTDOG_INCIDENT;
  const player = runtime?.player;
  const panel = document.getElementById('objectives');
  const objectiveItems = [...(panel?.querySelectorAll('li') ?? [])]
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);
  const style = panel ? getComputedStyle(panel) : null;
  return {
    surfacePresent: Boolean(player && runtime?.input?.snapshot),
    startupError: null,
    pointerLocked: document.pointerLockElement === document.querySelector('#scene'),
    player: player ? {
      enabled: player.enabled,
      mode: player.mode,
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      keys: [...player.keys],
    } : null,
    camera: player ? { yaw: player.yaw, pitch: player.pitch } : null,
    input: runtime?.input?.snapshot?.() ?? null,
    route: {
      entrypointId: 'bada_bing_two_hotdog',
      href: 'bing.html?visit=2',
      root: 'src/bing/hotdog-main.js',
      observedExits: ['squatch_graveyard'],
    },
    objective: {
      visible: Boolean(panel && style?.display !== 'none' && style?.visibility !== 'hidden'),
      count: objectiveItems.length,
      text: objectiveItems,
      changeObserved: null,
    },
    renderEvidence: {
      canvasWidth: document.querySelector('#scene')?.width ?? 0,
      canvasHeight: document.querySelector('#scene')?.height ?? 0,
      sceneChildren: runtime?.scene?.children?.length ?? 0,
      renderedFrameCount: runtime?.renderedFrameCount ?? 0,
    },
    subjectCounts: {
      meaningful_frame: (runtime?.renderedFrameCount ?? 0) > 0 ? 1 : 0,
      player: player ? 1 : 0,
      objective_item: objectiveItems.length,
      interactable: runtime?.interaction?.targets?.length ?? null,
      authored_actor: runtime?.party?.all?.length ?? null,
    },
    progressionChanged: null,
    interactionInvoked: null,
  };
}

function graveyardBootReady() {
  return window.GRAVEYARD?.phase === 'active';
}

function graveyardReady() {
  const runtime = window.GRAVEYARD;
  return Boolean(runtime?.phase === 'active'
    && runtime?.input?.snapshot?.().enabled
    && document.pointerLockElement === document.querySelector('#scene'));
}

function graveyardMoved({ x, z, minimum, code }) {
  const player = window.GRAVEYARD?.player;
  return Boolean(player?.enabled
    && player.mode === 'walk'
    && player.keys?.has(code)
    && Math.hypot(player.position.x - x, player.position.z - z) > minimum);
}

function observeGraveyardInput() {
  const runtime = window.GRAVEYARD;
  const player = runtime?.player;
  const panel = document.getElementById('objectives');
  const objectiveItems = [...(panel?.querySelectorAll('li') ?? [])]
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);
  const style = panel ? getComputedStyle(panel) : null;
  return {
    surfacePresent: Boolean(player && runtime?.input?.snapshot),
    startupError: null,
    pointerLocked: document.pointerLockElement === document.querySelector('#scene'),
    player: player ? {
      enabled: player.enabled,
      mode: player.mode,
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      keys: [...player.keys],
    } : null,
    camera: player ? { yaw: player.yaw, pitch: player.pitch } : null,
    input: runtime?.input?.snapshot?.() ?? null,
    route: {
      entrypointId: 'squatch_graveyard_canonical',
      href: 'graveyard.html',
      root: 'src/graveyard/main.js',
      observedExits: ['jerky_motel'],
    },
    objective: {
      visible: Boolean(panel && style?.display !== 'none' && style?.visibility !== 'hidden'),
      count: objectiveItems.length,
      text: objectiveItems,
      changeObserved: null,
    },
    renderEvidence: {
      canvasWidth: document.querySelector('#scene')?.width ?? 0,
      canvasHeight: document.querySelector('#scene')?.height ?? 0,
      sceneChildren: runtime?.scene?.children?.length ?? 0,
      renderedFrameCount: runtime?.renderedFrameCount ?? 0,
    },
    subjectCounts: {
      meaningful_frame: (runtime?.renderedFrameCount ?? 0) > 0 ? 1 : 0,
      player: player ? 1 : 0,
      objective_item: objectiveItems.length,
      interactable: runtime?.interaction?.targets?.length ?? null,
      authored_actor: null,
    },
    progressionChanged: null,
    interactionInvoked: null,
  };
}

function countrysideCabinBootReady() {
  const runtime = window.COUNTRYSIDE_CABIN;
  return Boolean(runtime?.input?.snapshot
    && runtime?.state?.phase === 'active');
}

function countrysideCabinReady() {
  const runtime = window.COUNTRYSIDE_CABIN;
  const input = runtime?.input?.snapshot?.();
  return Boolean(runtime?.state?.phase === 'active'
    && input?.enabled
    && input?.locked
    && document.pointerLockElement === document.querySelector('#scene'));
}

function countrysideCabinMoved({ x, z, minimum, code }) {
  const player = window.COUNTRYSIDE_CABIN?.player;
  return Boolean(player?.enabled
    && player.mode === 'walk'
    && player.keys?.has(code)
    && Math.hypot(player.position.x - x, player.position.z - z) > minimum);
}

function observeCountrysideCabinInput() {
  const runtime = window.COUNTRYSIDE_CABIN;
  const canvas = document.querySelector('#scene');
  const player = runtime?.player;
  const input = runtime?.input?.snapshot?.() ?? null;
  const panel = document.getElementById('objectives');
  const objectiveItems = [...(panel?.querySelectorAll('.olist li') ?? [])]
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);
  const style = panel ? getComputedStyle(panel) : null;
  const cabinCamera = runtime?.scene?.getObjectByName?.('countryside-cabin.camera') ?? null;
  const bootFailure = document.getElementById('bootFailure');
  const bootFailed = Boolean(bootFailure && !bootFailure.hidden);
  return {
    surfacePresent: Boolean(player && input && runtime?.state),
    startupError: bootFailed
      ? (bootFailure.textContent?.trim() || 'Cabin boot failure')
      : null,
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
    camera: player ? {
      yaw: player.yaw,
      pitch: player.pitch,
      owner: player.camera === cabinCamera ? 'core/player' : null,
      expectedOwner: 'core/player',
    } : null,
    input,
    route: {
      entrypointId: 'countryside_cabin_canonical',
      href: 'cabin.html',
      root: 'src/cabin/main.js',
      observedExits: ['silver_case'],
    },
    objective: {
      visible: Boolean(panel && !panel.classList.contains('hidden')
        && style?.display !== 'none' && style?.visibility !== 'hidden'),
      count: objectiveItems.length,
      text: objectiveItems,
      changeObserved: null,
    },
    renderEvidence: {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      sceneChildren: runtime?.scene?.children?.length ?? null,
      renderedFrameCount: null,
    },
    subjectCounts: {
      meaningful_frame: null,
      player: player ? 1 : 0,
      objective_item: objectiveItems.length,
      interactable: runtime?.interaction?.targets?.length ?? null,
      authored_actor: runtime?.lag ? 1 : 0,
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
  bada_bing_two_hotdog: Object.freeze({
    observable: true,
    surface: 'window.HOTDOG_INCIDENT',
    reason: 'HotDog publishes canonical input and Player observations behind a valid campaign seed.',
    storageSeed: Object.freeze({ key: CAMPAIGN_STORAGE_KEY, value: hotDogInputSeed() }),
    start: '#start-btn',
    bootReady: hotDogBootReady,
    canvas: '#scene',
    click: Object.freeze({ position: Object.freeze({ x: 320, y: 180 }) }),
    mouse: Object.freeze({
      from: Object.freeze({ x: 320, y: 180 }),
      to: Object.freeze({ x: 390, y: 145 }),
      steps: 2,
    }),
    keyboard: Object.freeze({ key: 'w', code: 'KeyW' }),
    movementMinimum: 0.35,
    readyTimeoutMs: 120_000,
    movementTimeoutMs: 8_000,
    lookSettleMs: 50,
    observe: observeHotDogInput,
    ready: hotDogReady,
    moved: hotDogMoved,
  }),
  bada_bing_two_legacy_main: unobservable('The legacy Bing-two variant requires durable campaign activation that a route alone cannot prove.'),
  squatch_graveyard_canonical: Object.freeze({
    observable: true,
    surface: 'window.GRAVEYARD',
    reason: 'Graveyard publishes canonical input and Player observations behind a body-loaded seed.',
    storageSeed: Object.freeze({ key: CAMPAIGN_STORAGE_KEY, value: graveyardInputSeed() }),
    start: '#start-btn',
    bootReady: graveyardBootReady,
    canvas: '#scene',
    click: Object.freeze({ position: Object.freeze({ x: 320, y: 180 }) }),
    mouse: Object.freeze({
      from: Object.freeze({ x: 320, y: 180 }),
      to: Object.freeze({ x: 390, y: 145 }),
      steps: 2,
    }),
    keyboard: Object.freeze({ key: 'w', code: 'KeyW' }),
    movementMinimum: 0.35,
    readyTimeoutMs: 120_000,
    movementTimeoutMs: 8_000,
    lookSettleMs: 50,
    observe: observeGraveyardInput,
    ready: graveyardReady,
    moved: graveyardMoved,
  }),
  jerky_motel_canonical: unobservable('Jerky Motel has no declared semantic-smoke observation surface yet.'),
  no_wake_canonical: unobservable('NO WAKE has no declared semantic-smoke observation surface yet.'),
  silver_room_canonical: unobservable('Silver Room has no declared semantic-smoke observation surface yet.'),
  silver_pines_canonical: unobservable('Silver Pines has no declared semantic-smoke observation surface yet.'),
  bank_heist_canonical: unobservable('Bank Heist has no declared semantic-smoke observation surface yet.'),
  countryside_cabin_canonical: Object.freeze({
    observable: true,
    surface: 'window.COUNTRYSIDE_CABIN',
    reason: 'Countryside Cabin publishes canonical input and Player observations behind a valid campaign entry.',
    storageSeed: Object.freeze({ key: CAMPAIGN_STORAGE_KEY, value: countrysideCabinInputSeed() }),
    start: '#start-btn',
    bootReady: countrysideCabinBootReady,
    canvas: '#scene',
    click: Object.freeze({ position: Object.freeze({ x: 320, y: 180 }) }),
    mouse: Object.freeze({
      from: Object.freeze({ x: 320, y: 180 }),
      to: Object.freeze({ x: 390, y: 145 }),
      steps: 3,
    }),
    keyboard: Object.freeze({ key: 'w', code: 'KeyW' }),
    movementMinimum: 0.25,
    readyTimeoutMs: 180_000,
    movementTimeoutMs: 45_000,
    lookSettleMs: 100,
    observe: observeCountrysideCabinInput,
    ready: countrysideCabinReady,
    moved: countrysideCabinMoved,
  }),
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
    journey: 'special_meeting_v1',
    click: Object.freeze({ position: Object.freeze({ x: 320, y: 180 }) }),
    mouse: Object.freeze({
      from: Object.freeze({ x: 320, y: 180 }),
      to: Object.freeze({ x: 402, y: 132 }),
      steps: 2,
    }),
    keyboard: Object.freeze({ key: 'd', code: 'KeyD' }),
    movementMinimum: 0.35,
    audio: Object.freeze({
      minimumEngines: 1,
      minimumRequiredReceipts: 1,
      requiredCuePrefixes: Object.freeze(['vo.specialmeeting.']),
    }),
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
    /* Input certification must not become hostage to incidental speech timing.
     * Scenes declare an audio evidence contract only when this journey is also
     * intended to certify recorded playback (Special Meeting is). */
    if (adapter.audio !== undefined) {
      if (!adapter.audio || typeof adapter.audio !== 'object' || Array.isArray(adapter.audio)) {
        throw new TypeError(`Observable Adapter ${entrypointId} audio contract must be an object`);
      }
      if (!Number.isInteger(adapter.audio.minimumEngines) || adapter.audio.minimumEngines < 1) {
        throw new TypeError(`Observable Adapter ${entrypointId} must require at least one AudioEngine`);
      }
      if (!Number.isInteger(adapter.audio.minimumRequiredReceipts)
        || adapter.audio.minimumRequiredReceipts < 1) {
        throw new TypeError(
          `Observable Adapter ${entrypointId} must require recorded-audio receipt evidence`,
        );
      }
      if (!Array.isArray(adapter.audio.requiredCuePrefixes)
        || adapter.audio.requiredCuePrefixes.length === 0
        || adapter.audio.requiredCuePrefixes.some((prefix) => (
          typeof prefix !== 'string' || !prefix.trim()
        ))) {
        throw new TypeError(
          `Observable Adapter ${entrypointId} must name expected recorded-audio cue prefixes`,
        );
      }
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
    pageerror: (error) => {
      if (process.env.SEMANTIC_SMOKE_TRACE_ERRORS === '1') {
        console.error(error?.stack ?? messageOf(error));
        errors.page.push(error?.stack ?? messageOf(error));
        return;
      }
      errors.page.push(messageOf(error));
    },
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

export function evaluateSemanticSmokeObligation(obligation, evidence, transport = {}) {
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
    const ownerMatchesPhase = evidence.after?.camera?.ownerMatchesPhase;
    if (typeof ownerMatchesPhase === 'boolean') {
      return verdict(true, ownerMatchesPhase,
        'The canonical camera owner matched every observed authored phase.',
        'At least one authored phase displaced the canonical camera owner.');
    }
    const owner = evidence.after?.camera?.owner;
    const expectedOwner = evidence.after?.camera?.expectedOwner;
    return verdict(Boolean(owner && expectedOwner), owner === expectedOwner,
      `Camera owner ${owner} matches the active phase.`,
      `Camera owner ${owner} does not match ${expectedOwner}.`);
  }
  if (assertion.kind === 'camera-behavior' && assertion.behavior === 'returns_to_playable_view') {
    const returned = evidence.after?.camera?.returnedToPlayableView;
    return verdict(typeof returned === 'boolean', returned,
      'The authored passenger pose returned to a real-input playable view.',
      'The authored passenger pose did not return to a real-input playable view.');
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
  if (assertion.kind === 'entry-spawn-liveness') {
    const spawn = evidence.after?.spawnEvidence?.[assertion.spawnId];
    const known = spawn
      && typeof spawn.requested === 'string'
      && typeof spawn.effective === 'string'
      && typeof spawn.live === 'boolean'
      && finite(spawn.legalActionCount);
    const passed = known
      && spawn.requested === assertion.spawnId
      && spawn.effective === assertion.spawnId
      && spawn.live
      && (!assertion.mustExposeLegalProgression || spawn.legalActionCount >= 1);
    return verdict(Boolean(known), Boolean(passed),
      `Spawn ${assertion.spawnId} booted live with ${spawn?.legalActionCount} legal action(s).`,
      `Spawn ${assertion.spawnId} did not boot as the requested live state with legal progression.`);
  }
  if (assertion.kind === 'checkpoint-liveness') {
    const checkpoint = evidence.after?.checkpointEvidence?.[assertion.checkpointId];
    const known = checkpoint
      && typeof checkpoint.requested === 'string'
      && typeof checkpoint.effective === 'string'
      && typeof checkpoint.live === 'boolean'
      && finite(checkpoint.legalActionCount);
    const passed = known
      && checkpoint.requested === assertion.checkpointId
      && checkpoint.effective === assertion.checkpointId
      && checkpoint.live
      && (!assertion.mustExposeLegalProgression || checkpoint.legalActionCount >= 1);
    return verdict(Boolean(known), Boolean(passed),
      `Checkpoint ${assertion.checkpointId} restored live with ${checkpoint?.legalActionCount} legal action(s).`,
      `Checkpoint ${assertion.checkpointId} did not restore the requested live state with legal progression.`);
  }
  return {
    status: SEMANTIC_SMOKE_STATUS.UNKNOWN,
    reason: `No executable assertion Adapter exists for ${assertion.kind}.`,
  };
}

async function exerciseObservableAdapter(page, adapter, errors) {
  const actions = [];
  if (adapter.start) {
    await page.locator(adapter.start).click();
    actions.push({ kind: 'click', selector: adapter.start, purpose: 'start scene' });
    await page.waitForFunction(adapter.bootReady, null, { timeout: adapter.readyTimeoutMs });
  }
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

function progressionActionCount(observation) {
  const actions = observation?.spawn?.legalActions;
  if (!Array.isArray(actions)) return null;
  return actions.filter((action) => (
    action === 'player.move'
      || action === 'gesture.audio_wake'
      || action.startsWith('interaction.')
      || action.startsWith('choice.')
      || action.startsWith('timeline.')
  )).length;
}

function liveSpawnEvidence(observation, expectedSpawn, inputEvidence = null) {
  const requested = observation?.spawn?.requested ?? null;
  const effective = observation?.spawn?.effective ?? null;
  const legalActionCount = progressionActionCount(observation);
  const frameCount = observation?.renderEvidence?.renderedFrameCount;
  const playableInput = inputEvidence == null
    || inputEvidence.move === true
    || inputEvidence.pointer_lock === true;
  return {
    requested,
    effective,
    legalActionCount,
    live: requested === expectedSpawn
      && effective === expectedSpawn
      && finite(frameCount)
      && frameCount > 0
      && finite(legalActionCount)
      && legalActionCount > 0
      && playableInput,
  };
}

/**
 * Short, real-input Special Meeting journey.
 *
 * Kerb proves movement/look, the physical car-door interaction, passenger
 * pose, dialogue-backed objective progression, and recorded speech. Reloading
 * a publicly persisted `spur` scene entry then proves the alternate spawn is
 * reconstructed live and the same Player owns a restored walk view. No debug
 * skip or mission-advance hook is used.
 */
async function exerciseSpecialMeetingJourney(page, adapter, errors) {
  const kerb = await exerciseObservableAdapter(page, adapter, errors);
  const actions = [...kerb.actions];

  /* Undo the look probe with another real mouse move so the authored spawn aim
   * is restored before asking whether the car door is discoverable. */
  await page.mouse.move(adapter.mouse.from.x, adapter.mouse.from.y, { steps: adapter.mouse.steps });
  actions.push({ kind: 'mouse', ...adapter.mouse.from, steps: adapter.mouse.steps });
  try {
    await page.waitForFunction(specialMeetingCarDoorAvailable, null, {
      polling: 'raf',
      timeout: 45_000,
    });
  } catch (error) {
    errors.action.push(`Car-door action never became available: ${messageOf(error)}`);
  }

  /* The movement probe is a real strafe, so the car is no longer guaranteed
   * to remain under the untouched spawn crosshair. Sweep toward its visible
   * kerb-side door with real mouse input. The test may search like a player;
   * it may not read a world transform or set camera state through the debug
   * surface. */
  let foundCarDoor = false;
  for (const x of [240, 160, 80, 20]) {
    await page.mouse.move(x, adapter.mouse.from.y, { steps: 2 });
    actions.push({ kind: 'mouse', x, y: adapter.mouse.from.y, steps: 2, purpose: 'find car door' });
    try {
      await page.waitForFunction(specialMeetingAtCarDoor, null, {
        polling: 'raf',
        timeout: 1_500,
      });
      foundCarDoor = true;
      break;
    } catch {
      // Continue the bounded, player-visible sweep.
    }
  }
  if (!foundCarDoor) {
    errors.action.push('Car-door discovery failed after a bounded real-mouse sweep.');
  }

  const beforeInteraction = await page.evaluate(adapter.observe);
  const previousUseCount = beforeInteraction?.interaction?.useCount ?? 0;
  await page.keyboard.down('e');
  actions.push({ kind: 'key-down', key: 'e', purpose: 'car-door interaction' });
  await page.keyboard.up('e');
  actions.push({ kind: 'key-up', key: 'e', purpose: 'car-door interaction' });
  try {
    await page.waitForFunction(specialMeetingUsedCarDoor, previousUseCount, {
      polling: 'raf',
      timeout: 30_000,
    });
  } catch (error) {
    errors.action.push(`Car-door use failed: ${messageOf(error)}`);
  }
  try {
    await page.waitForFunction(
      specialMeetingObjectiveAdvanced,
      kerb.evidence.before?.objective?.revision ?? 0,
      { polling: 'raf', timeout: 60_000 },
    );
  } catch (error) {
    errors.action.push(`Objective progression failed: ${messageOf(error)}`);
  }
  const afterInteraction = await page.evaluate(adapter.observe);
  const kerbAudio = await page.evaluate(observeQaAudioPolicy);

  const seeded = await page.evaluate(selectSpecialMeetingSpurCheckpoint);
  actions.push({ kind: 'checkpoint-seed', sceneId: seeded?.id ?? null, spawn: seeded?.spawn ?? null });
  await page.reload({ waitUntil: 'load', timeout: adapter.readyTimeoutMs });
  actions.push({ kind: 'reload', purpose: 'persisted spur checkpoint' });
  const spur = await exerciseObservableAdapter(page, adapter, errors);
  actions.push(...spur.actions.map((action) => ({ ...action, scenario: 'spur' })));

  const kerbFinal = afterInteraction ?? kerb.evidence.after;
  const spurFinal = spur.evidence.after;
  const kerbSpawn = liveSpawnEvidence(kerb.evidence.before, 'kerb', kerb.evidence.input);
  const spurSpawn = liveSpawnEvidence(spurFinal, 'spur', spur.evidence.input);
  const cameraOwnerSnapshots = [
    kerb.evidence.before,
    afterInteraction,
    spur.evidence.before,
    spurFinal,
  ].filter(Boolean);
  const ownerMatchesPhase = cameraOwnerSnapshots.every((observation) => (
    observation.camera?.owner === 'core/player'
      && observation.camera?.identity
      && observation.camera.identity === observation.camera.playerCameraIdentity
  ));
  const returnedToPlayableView = afterInteraction?.camera?.poseAdapter === 'passenger_rig'
    && spurFinal?.camera?.poseAdapter === 'walk'
    && spur.evidence.input.move === true
    && finite(spur.evidence.yawDelta)
    && Math.abs(spur.evidence.yawDelta) > 0.01;
  const interactionInvoked = (afterInteraction?.interaction?.useCount ?? 0) > previousUseCount;
  const objectiveChanged = finite(kerb.evidence.before?.objective?.revision)
    && finite(afterInteraction?.objective?.revision)
    && afterInteraction.objective.revision > kerb.evidence.before.objective.revision
    && afterInteraction.objective.runtimeText !== kerb.evidence.before.objective.runtimeText;
  const renderedFrameCount = Math.max(
    kerbFinal?.renderEvidence?.renderedFrameCount ?? 0,
    spurFinal?.renderEvidence?.renderedFrameCount ?? 0,
  );
  const compositeAfter = {
    ...spurFinal,
    route: kerbFinal?.route ?? spurFinal?.route ?? null,
    camera: {
      ...spurFinal?.camera,
      ownerMatchesPhase,
      returnedToPlayableView,
    },
    objective: {
      ...afterInteraction?.objective,
      changeObserved: objectiveChanged,
    },
    renderEvidence: {
      ...spurFinal?.renderEvidence,
      renderedFrameCount,
    },
    subjectCounts: {
      meaningful_frame: renderedFrameCount > 0 ? 1 : 0,
      player: Math.max(kerbFinal?.subjectCounts?.player ?? 0, spurFinal?.subjectCounts?.player ?? 0),
      objective_item: Math.max(
        afterInteraction?.subjectCounts?.objective_item ?? 0,
        spurFinal?.subjectCounts?.objective_item ?? 0,
      ),
      interactable: Math.max(
        kerbFinal?.subjectCounts?.interactable ?? 0,
        spurFinal?.subjectCounts?.interactable ?? 0,
      ),
      authored_actor: Math.max(
        kerbFinal?.subjectCounts?.authored_actor ?? 0,
        spurFinal?.subjectCounts?.authored_actor ?? 0,
      ),
    },
    interactionInvoked,
    progressionChanged: interactionInvoked
      && beforeInteraction?.mission?.rideBeat !== afterInteraction?.mission?.rideBeat,
    spawnEvidence: { kerb: kerbSpawn, spur: spurSpawn },
    checkpointEvidence: { kerb: kerbSpawn, spur: spurSpawn },
  };

  return {
    actions,
    observations: {
      before: kerb.observations.before,
      afterLook: kerb.observations.afterLook,
      held: kerb.observations.held,
      after: compositeAfter,
      beforeInteraction,
      afterInteraction,
      spur: spur.observations,
    },
    evidence: {
      ...kerb.evidence,
      after: compositeAfter,
      audio: kerbAudio,
      scenarios: { kerb: kerb.evidence, afterInteraction, spur: spur.evidence },
    },
  };
}

export async function executeSemanticSmokeCase({
  page,
  smokeCase,
  baseUrl,
  navigationTimeoutMs = 30_000,
  exerciseJourneys = true,
} = {}) {
  if (!page) throw new TypeError('executeSemanticSmokeCase requires a Playwright page');
  if (!smokeCase) throw new TypeError('executeSemanticSmokeCase requires a smokeCase');
  if (!baseUrl) throw new TypeError('executeSemanticSmokeCase requires a baseUrl');

  if (typeof page.addInitScript !== 'function') {
    throw new TypeError('executeSemanticSmokeCase requires page.addInitScript for strict QA policy');
  }
  await page.addInitScript(installQaAudioPolicy);
  if (smokeCase.adapter.storageSeed) {
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, smokeCase.adapter.storageSeed);
  }
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
      const exercise = exerciseJourneys && smokeCase.adapter.journey === 'special_meeting_v1'
        ? exerciseSpecialMeetingJourney
        : exerciseObservableAdapter;
      ({ actions, observations, evidence } = await exercise(
        page, smokeCase.adapter, diagnostics.errors,
      ));
    } catch (error) {
      diagnostics.errors.action.push(messageOf(error));
    }
  }
  let audio = evidence.audio ?? null;
  if (!navigationError) {
    try {
      audio ??= await page.evaluate(observeQaAudioPolicy);
      if (!audio?.installed || !audio.strictRequiredRecordings) {
        diagnostics.errors.action.push('Strict required-recording QA policy was not installed.');
      } else if (audio.engineCount !== audio.strictEngineCount) {
        diagnostics.errors.action.push(
          `${audio.engineCount - audio.strictEngineCount} AudioEngine instance(s) bypassed strict QA.`,
        );
      }
      const audioContract = smokeCase.adapter.audio ?? null;
      const minimumAudioEngines = audioContract?.minimumEngines ?? 0;
      if (audio?.engineCount < minimumAudioEngines) {
        diagnostics.errors.action.push(
          `Observed ${audio.engineCount} AudioEngine instance(s); expected at least `
          + `${minimumAudioEngines}.`,
        );
      }
      if (audioContract) {
        const minimumReceipts = audioContract.minimumRequiredReceipts;
        if (audio?.scheduledRequiredRecordingCount < minimumReceipts) {
          diagnostics.errors.action.push(
            `Observed ${audio?.scheduledRequiredRecordingCount ?? 0} scheduled required recording(s); `
            + `expected at least ${minimumReceipts}.`,
          );
        }
        for (const prefix of audioContract.requiredCuePrefixes) {
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
      ...evaluateSemanticSmokeObligation(obligation, evidence, transport),
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
      audio: smokeCase.adapter.audio ?? null,
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
