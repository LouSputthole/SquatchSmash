#!/usr/bin/env node
/**
 * Evidence-backed mission-liveness observations for exported state machines.
 *
 * This catalog deliberately stops at the exported boundary. NO WAKE's story
 * publishes durable checkpoints but not its live phase, timers, or interaction
 * inventory. Hot Dog's mission publishes state and method eligibility, while
 * the page root still owns director timing and spatial reachability. Those
 * gaps are REFUSED/UNKNOWN here rather than guessed into green results.
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { SecondVisitMission } from '../src/bing/second-visit.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from '../src/core/bada-bing-two-story.js';
import {
  EVENT_IDS,
  MISSION_IDS,
  NO_WAKE_CHECKPOINT_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  evaluateMissionLiveness,
  formatMissionLivenessResult,
  MISSION_LIVENESS_SIGNAL,
} from '../src/core/mission-liveness.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';

const CATALOG_SCHEMA_VERSION = 1;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireTransition(value, label) {
  if (value !== true) throw new Error(`scene liveness catalog transition refused: ${label}`);
}

function requireState(mission, expected, label) {
  if (mission.state !== expected) {
    throw new Error(
      `scene liveness catalog expected ${label} to reach ${expected}; reached ${mission.state}`,
    );
  }
}

function refused(reason) {
  return {
    state: MISSION_LIVENESS_SIGNAL.REFUSED,
    reason,
  };
}

function makeEntry({
  id,
  machine,
  machinePhase,
  campaignCheckpoint,
  restoreShape,
  evidence,
  observation,
}) {
  return deepFreeze({
    id,
    machine,
    machinePhase,
    campaignCheckpoint,
    restoreShape,
    evidence,
    observation,
  });
}

function readyNoWakeCampaign() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'no_wake';
    state.story.day = 3;
    state.story.timeMinutes = 12 * 60 + 45;
    state.scene = { id: SCENE_IDS.NO_WAKE, spawn: 'gate_c' };
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
    state.missions[MISSION_IDS.NO_WAKE].status = 'available';
  });
  return campaign;
}

function noWakeEntry(campaign, checkpoint) {
  const mission = campaign.state.missions[MISSION_IDS.NO_WAKE];
  const terminal = mission.status === 'complete' && checkpoint === 'returned';
  const observation = terminal
    ? {
      sceneId: SCENE_IDS.NO_WAKE,
      phase: 'complete',
      checkpoint,
      terminal: true,
      pendingAutomaticTransition: false,
      progressActions: [],
    }
    : {
      sceneId: SCENE_IDS.NO_WAKE,
      phase: 'restore',
      checkpoint,
      terminal: false,
      pendingAutomaticTransition: refused(
        `NoWakeStory checkpoint ${checkpoint} does not expose the runtime phase or pending timer owned by src/nowake/main.js`,
      ),
      // Intentionally omitted: NoWakeStory cannot enumerate live Interaction
      // targets or prove that any target is reachable after reconstruction.
    };
  return makeEntry({
    id: `no_wake:${terminal ? 'complete' : 'restore'}:${checkpoint}`,
    machine: 'NoWakeStory',
    machinePhase: terminal ? 'complete' : null,
    campaignCheckpoint: checkpoint,
    restoreShape: terminal ? 'terminal_story_state' : 'campaign_checkpoint_restore',
    evidence: [
      'src/core/no-wake-story.js',
      'src/core/campaign.js:NO_WAKE_CHECKPOINT_IDS',
      'src/nowake/main.js:resumeCheckpoint',
    ],
    observation,
  });
}

/** Drive every accepted NoWakeStory checkpoint in its real monotonic order. */
export function buildNoWakeLivenessCatalog() {
  const campaign = readyNoWakeCampaign();
  const story = createNoWakeStory({ campaign });
  const begun = story.begin();
  if (begun?.ok !== true || begun.resumed !== false) {
    throw new Error('scene liveness catalog could not begin a fresh NO WAKE story');
  }

  const entries = [noWakeEntry(campaign, 'dock')];
  for (const checkpoint of NO_WAKE_CHECKPOINT_IDS) {
    if (checkpoint === 'dock' || checkpoint === 'returned') continue;
    requireTransition(story.checkpoint(checkpoint), `NO WAKE checkpoint ${checkpoint}`);
    entries.push(noWakeEntry(campaign, checkpoint));
  }
  requireTransition(story.complete({
    betrayalConfirmed: true,
    playerFired: true,
    bodyDisposed: true,
  }), 'NO WAKE completion');
  entries.push(noWakeEntry(campaign, 'returned'));
  return deepFreeze(entries);
}

function readyHotDogCampaign() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  return campaign;
}

function beginHotDogRun() {
  const campaign = readyHotDogCampaign();
  const story = createBadaBingTwoStory({ campaign });
  const begun = story.begin();
  if (begun?.ok !== true || begun.resumed !== false || begun.checkpoint !== 'party') {
    throw new Error('scene liveness catalog could not begin a fresh Hot Dog story');
  }
  return { campaign, story, mission: new SecondVisitMission() };
}

function reachHotDogAttack(run) {
  run.mission.enteredClub();
  requireState(run.mission, 'party', 'enteredClub');
  requireTransition(run.mission.startPerformance(), 'Hot Dog startPerformance');
  requireTransition(run.mission.finishPerformance(), 'Hot Dog finishPerformance');
  requireTransition(run.mission.startAttack(), 'Hot Dog startAttack');
  requireState(run.mission, 'attack', 'startAttack');
  return run;
}

function reachHotDogCleanup(run) {
  reachHotDogAttack(run);
  requireTransition(run.mission.resolveAttack(), 'Hot Dog resolveAttack');
  requireTransition(run.story.recordAttack({ attackResolved: true }), 'Hot Dog recordAttack');
  requireState(run.mission, 'cleanup', 'resolveAttack');
  return run;
}

function spatialAction(id, label, method, reason = null) {
  return {
    id,
    label,
    enabled: true,
    reachable: refused(reason
      || `SecondVisitMission exposes ${method} eligibility, but src/bing/hotdog-main.js owns the interaction target and spatial reachability`),
  };
}

function directorRefusal(phase) {
  return refused(
    `SecondVisitMission state ${phase} does not expose the Hot Dog director's running, wait, or timer state`,
  );
}

function hotDogCheckpointLabel(campaignCheckpoint, restoreShape) {
  return `${campaignCheckpoint}::${restoreShape}`;
}

function hotDogEntry(run, {
  id,
  restoreShape,
  actions = [],
  automatic = false,
  terminal = false,
}) {
  const saved = run.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  const phase = run.mission.state;
  return makeEntry({
    id: `hotdog:${id}`,
    machine: 'SecondVisitMission + BadaBingTwoStory',
    machinePhase: phase,
    campaignCheckpoint: saved.checkpoint,
    restoreShape,
    evidence: [
      'src/bing/second-visit.js:SecondVisitMission',
      'src/core/bada-bing-two-story.js:BadaBingTwoStory',
      'src/bing/hotdog-main.js:restoreFromCampaign',
    ],
    observation: {
      sceneId: SCENE_IDS.BADA_BING_TWO,
      phase,
      checkpoint: hotDogCheckpointLabel(saved.checkpoint, restoreShape),
      terminal,
      pendingAutomaticTransition: automatic,
      progressActions: actions,
    },
  });
}

function subsets(values) {
  const combinations = [];
  for (let mask = 0; mask < 2 ** values.length; mask += 1) {
    combinations.push(values.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return combinations;
}

function buildHotDogPrefixEntries() {
  const run = beginHotDogRun();
  const entries = [hotDogEntry(run, {
    id: 'lot',
    restoreShape: 'fresh_before_club_entry',
    actions: [spatialAction('enter_club', 'Enter the closed club', 'enteredClub()')],
  })];

  run.mission.enteredClub();
  requireState(run.mission, 'party', 'enteredClub');
  entries.push(hotDogEntry(run, {
    id: 'party',
    restoreShape: 'party_open',
    actions: [
      spatialAction('enjoy_party_beat', 'Participate in a party beat', 'enjoyedParty()'),
      spatialAction('start_performance', 'Start Hog Mama\'s set', 'startPerformance()'),
    ],
  }));

  requireTransition(run.mission.startPerformance(), 'Hot Dog startPerformance');
  entries.push(hotDogEntry(run, {
    id: 'performance',
    restoreShape: 'director_performance',
    automatic: directorRefusal('performance'),
  }));

  requireTransition(run.mission.finishPerformance(), 'Hot Dog finishPerformance');
  entries.push(hotDogEntry(run, {
    id: 'tension',
    restoreShape: 'director_tension',
    automatic: directorRefusal('tension'),
  }));

  requireTransition(run.mission.startAttack(), 'Hot Dog startAttack');
  entries.push(hotDogEntry(run, {
    id: 'attack',
    restoreShape: 'player_driven_attack',
    actions: [spatialAction(
      'resolve_attack',
      'Resolve Ape and HotDog\'s attack',
      'resolveAttack()',
      'SecondVisitMission exposes resolveAttack(), but the exported model does not expose the live attack controller, target, or hit reachability',
    )],
  }));
  return entries;
}

function buildHotDogCleanupEntries() {
  const probe = new SecondVisitMission();
  const roomTasks = probe.roomTasks;
  const expectedRoomTasks = BADA_BING_TWO_CLEANUP_TASKS
    .filter((task) => task !== 'final_sweep');
  if (roomTasks.join('\u0000') !== expectedRoomTasks.join('\u0000')) {
    throw new Error('Hot Dog mission and campaign cleanup task inventories disagree');
  }

  return subsets(roomTasks).map((completed) => {
    const run = reachHotDogCleanup(beginHotDogRun());
    for (const task of completed) {
      requireTransition(run.mission.completeCleanup(task), `Hot Dog completeCleanup ${task}`);
      requireTransition(run.story.recordCleanup(task), `Hot Dog recordCleanup ${task}`);
    }
    const remaining = roomTasks.filter((task) => !completed.includes(task));
    const signature = completed.length ? completed.join('+') : 'none';
    const actions = remaining.length
      ? remaining.map((task) => spatialAction(
        `cleanup_${task}`,
        `Complete ${task}`,
        `completeCleanup(${task})`,
      ))
      : [spatialAction('wrap_body', 'Wrap Billy HotDog', 'wrapBody()')];
    return hotDogEntry(run, {
      id: `cleanup:${signature}`,
      restoreShape: `cleanup_tasks=${signature}`,
      actions,
    });
  });
}

function buildHotDogEndingEntries() {
  const run = reachHotDogCleanup(beginHotDogRun());
  for (const task of run.mission.roomTasks) {
    requireTransition(run.mission.completeCleanup(task), `Hot Dog completeCleanup ${task}`);
    requireTransition(run.story.recordCleanup(task), `Hot Dog recordCleanup ${task}`);
  }

  requireTransition(run.mission.wrapBody(), 'Hot Dog wrapBody');
  const entries = [hotDogEntry(run, {
    id: 'body-ready:wrapped',
    restoreShape: 'body_wrapped_not_carried',
    actions: [spatialAction('carry_body', 'Pick Billy up', 'carryBody()')],
  })];

  requireTransition(run.mission.carryBody(), 'Hot Dog carryBody');
  entries.push(hotDogEntry(run, {
    id: 'body-ready:carried',
    restoreShape: 'body_carried_not_loaded',
    actions: [spatialAction('load_body', 'Load Billy into Snow\'s car', 'assign()')],
  }));

  requireTransition(run.mission.assign('reserve_pickup'), 'Hot Dog assign');
  entries.push(hotDogEntry(run, {
    id: 'debrief',
    restoreShape: 'body_loaded_not_debriefed',
    actions: [spatialAction('debrief_lou', 'Report to Big Uncle Lou', 'debriefLou()')],
  }));

  requireTransition(run.mission.debriefLou(), 'Hot Dog debriefLou');
  entries.push(hotDogEntry(run, {
    id: 'sweep:awaiting',
    restoreShape: 'awaiting_final_sweep',
    actions: [spatialAction(
      'final_sweep',
      'Perform Lou\'s final evidence sweep',
      'completeCleanup(final_sweep)',
    )],
  }));

  requireTransition(run.mission.completeCleanup('final_sweep'), 'Hot Dog final sweep');
  requireTransition(run.story.recordCleanup('final_sweep'), 'Hot Dog record final sweep');
  requireTransition(run.story.completeClub({
    assignment: run.mission.assignment,
    bodyWrapped: run.mission.flags.bodyWrapped,
    bodyLoaded: run.mission.flags.bodyLoaded,
  }), 'Hot Dog completeClub');
  entries.push(hotDogEntry(run, {
    id: 'sweep:handoff',
    restoreShape: 'body_loaded_handoff_director',
    automatic: directorRefusal('handoff'),
  }));

  requireTransition(run.mission.beginDeparture(), 'Hot Dog beginDeparture');
  entries.push(hotDogEntry(run, {
    id: 'sweep:departing',
    restoreShape: 'body_loaded_departing',
    actions: [spatialAction(
      'leave_service_door',
      'Leave through the service door',
      'finish()',
      'SecondVisitMission exposes finish(), but src/bing/hotdog-main.js owns room and door state, including the already-in-yard level condition',
    )],
  }));

  if (run.mission.finish() !== 'graveyard') {
    throw new Error('scene liveness catalog Hot Dog finish did not reach graveyard');
  }
  entries.push(hotDogEntry(run, {
    id: 'done',
    restoreShape: 'scene_complete',
    terminal: true,
  }));
  return entries;
}

/** Enumerate real SecondVisitMission states and all eight legal cleanup subsets. */
export function buildHotDogLivenessCatalog() {
  return deepFreeze([
    ...buildHotDogPrefixEntries(),
    ...buildHotDogCleanupEntries(),
    ...buildHotDogEndingEntries(),
  ]);
}

export function buildSceneLivenessCatalog() {
  return deepFreeze([
    ...buildNoWakeLivenessCatalog(),
    ...buildHotDogLivenessCatalog(),
  ]);
}

export function sceneLivenessCatalogDocument() {
  const entries = buildSceneLivenessCatalog();
  return deepFreeze({
    schemaVersion: CATALOG_SCHEMA_VERSION,
    sources: [
      'src/core/no-wake-story.js',
      'src/nowake/main.js:resumeCheckpoint',
      'src/core/bada-bing-two-story.js',
      'src/bing/second-visit.js:SecondVisitMission',
      'src/bing/hotdog-main.js:restoreFromCampaign',
    ],
    observations: entries.map(({ observation }) => observation),
  });
}

function printHuman(entries) {
  const results = entries.map((entry) => ({
    id: entry.id,
    result: evaluateMissionLiveness(entry.observation),
  }));
  const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  for (const { result } of results) counts[result.status] += 1;
  console.log(
    `Scene liveness catalog: ${entries.length} shapes (${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.UNKNOWN} UNKNOWN)`,
  );
  for (const { id, result } of results) {
    console.log(`[${id}] ${formatMissionLivenessResult(result)}`);
  }
  return counts;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const args = process.argv.slice(2);
    if (args.some((argument) => argument !== '--json' && argument !== '--strict')) {
      throw new Error('Usage: node tools/scene-liveness-catalog.mjs [--json] [--strict]');
    }
    const entries = buildSceneLivenessCatalog();
    if (args.includes('--json')) console.log(JSON.stringify(sceneLivenessCatalogDocument(), null, 2));
    const counts = args.includes('--json')
      ? entries.reduce((accumulator, entry) => {
        accumulator[evaluateMissionLiveness(entry.observation).status] += 1;
        return accumulator;
      }, { PASS: 0, FAIL: 0, UNKNOWN: 0 })
      : printHuman(entries);
    if (args.includes('--strict') && (counts.FAIL > 0 || counts.UNKNOWN > 0)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
