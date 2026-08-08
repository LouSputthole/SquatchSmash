import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createFinalArcRuntimeSession } from '../src/core/final-arc-runtime.js';
import { createEnolaSquatchCampaignStory } from '../src/core/final-arc-story.js';
import { MissionController } from '../src/enolasquatch/mission/MissionController.js';
import { Targeting } from '../src/enolasquatch/combat/Targeting.js';
import {
  enolaCompletionReportFromSave,
  enolaResumePlan,
  enolaResumePhase,
} from '../src/enolasquatch/campaign.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('Enola forwards the real saved checkpoint snapshot to its campaign seam', () => {
  const seen = [];
  const mission = {
    physics: {
      position: new THREE.Vector3(10, 20, 30),
      headingDeg: 87,
      velocity: new THREE.Vector3(1, 2, 3),
      quat: new THREE.Quaternion(),
      damage: { wing: 0.1 },
    },
    engines: { fuel: 0.72 },
    targeting: { checkpoint: () => ({ scoreSum: 0, scoreTime: 0 }) },
    score: { takeoff: 0.84 },
    payloadReleased: false,
    weather: { dusk: 1 },
    flightHud: { showCheckpoint() {}, hideCheckpoint() {} },
    onCheckpoint: (id, snapshot) => seen.push({ id, snapshot }),
  };

  MissionController.prototype.saveCheckpoint.call(mission, 'turnOnCourse');

  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 'turnOnCourse');
  assert.equal(seen[0].snapshot.name, 'turnOnCourse');
  assert.equal(seen[0].snapshot.payloadReleased, false);
  assert.notEqual(seen[0].snapshot.position, mission.physics.position);
});

test('Enola does not forward an invalid checkpoint', () => {
  const seen = [];
  MissionController.prototype.saveCheckpoint.call({
    onCheckpoint: (...args) => seen.push(args),
  }, 'not-a-checkpoint');
  assert.deepEqual(seen, []);
});

test('Enola durable checkpoints map to its existing playable restore phases', () => {
  assert.equal(enolaResumePhase('takeoff'), 'takeoff');
  assert.equal(enolaResumePhase('turnOnCourse'), 'cruise');
  assert.equal(enolaResumePhase('preRelease'), 'bombApproach');
  assert.equal(enolaResumePhase('return'), 'return');
  assert.equal(enolaResumePhase('not_real'), null);
});

test('an Enola completion save rebuilds a truthful FlightHud report card', () => {
  const unlocks = ['Enola Squatch Flight Jacket', 'Fat Squatch Dashboard Ornament'];
  const report = enolaCompletionReportFromSave({
    status: 'complete',
    rank: 'Night Ops Professional',
    score: 0.82,
    unlocks,
    payloadReleased: true,
    returnedHome: true,
  });

  assert.deepEqual(report, {
    stats: [
      { label: 'Mission score', value: '82%', grade: 'good' },
      { label: 'Payload released', value: 'YES', grade: 'good' },
      { label: 'Returned home', value: 'YES', grade: 'good' },
    ],
    rank: 'Night Ops Professional',
    tier: 3,
    total: 0.82,
    unlocks: ['Enola Squatch Flight Jacket', 'Fat Squatch Dashboard Ornament'],
  });
  assert.notEqual(report.unlocks, unlocks, 'the report must own a safe copy of its list');
  assert.equal(enolaCompletionReportFromSave({ status: 'in_progress' }), null);
});

test('an Enola checkpoint snapshot survives reload with the same eventual report and rank', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'in_progress';
  });
  const runtime = createFinalArcRuntimeSession({
    campaign,
    sceneId: SCENE_IDS.ENOLA_SQUATCH,
    spawn: 'airfield',
    storyFactory: createEnolaSquatchCampaignStory,
  });
  runtime.begin();

  const score = {
    takeoff: 0.86,
    finalLanding: null,
    patrolPeak: 0.23,
    lowestClearance: 127,
    flightTime: 812.5,
    fuelRemaining: 0.57,
    damage: 0.19,
    bombAccuracy: 0.78,
    expressShipping: false,
    corridorScore: 0.91,
    roughAir: 0.4,
    fightersDestroyed: 2,
    fighterPasses: 4,
    flakBursts: 6,
    autopilotSeconds: 17.5,
    gunnerSeconds: 22,
    blastDistance: 1460,
  };
  assert.equal(runtime.checkpoint('preRelease', {
    checkpointSnapshot: {
      name: 'preRelease',
      position: new THREE.Vector3(1, 2, 3),
      velocity: new THREE.Vector3(4, 5, 6),
      quat: new THREE.Quaternion(),
      heading: 87,
      dusk: 1,
      fuel: 1712.25,
      damage: { wing: 0.21, gear: 0.08, tireBurst: true },
      targeting: { scoreSum: 91, scoreTime: 100 },
      score,
      payloadReleased: false,
    },
  }), true);

  const reloadedCampaign = createCampaign({ storage });
  const reloaded = createFinalArcRuntimeSession({
    campaign: reloadedCampaign,
    sceneId: SCENE_IDS.ENOLA_SQUATCH,
    spawn: 'airfield',
    storyFactory: createEnolaSquatchCampaignStory,
  });
  const entry = reloaded.begin();
  const plan = enolaResumePlan(entry.checkpoint, entry.checkpointSnapshot);

  assert.equal(plan.phase, 'bombApproach');
  assert.equal(plan.legacyFallback, false);
  assert.equal(plan.checkpointData.fuel, 1712.25);
  assert.deepEqual(plan.checkpointData.damage, {
    wing: 0.21,
    gear: 0.08,
    tireBurst: true,
  });
  assert.deepEqual(plan.checkpointData.targeting, {
    scoreSum: 91,
    scoreTime: 100,
  });
  assert.equal('position' in plan.checkpointData, false);
  assert.equal('velocity' in plan.checkpointData, false);
  assert.equal('quat' in plan.checkpointData, false);
  assert.equal('heading' in plan.checkpointData, false);
  assert.equal('dusk' in plan.checkpointData, false);
  assert.equal('lowestClearance' in plan.checkpointData.score, false);

  const initialScore = {
    takeoff: null,
    finalLanding: null,
    patrolPeak: 0,
    flightTime: 0,
    fuelRemaining: 1,
    damage: 0,
    bombAccuracy: null,
    expressShipping: false,
    corridorScore: 0,
    fightersDestroyed: 0,
    fighterPasses: 0,
    autopilotSeconds: 0,
    blastDistance: null,
  };
  const expectedReport = MissionController.prototype.report.call({
    score: { ...initialScore, ...score },
  });
  const restoredReport = MissionController.prototype.report.call({
    score: { ...initialScore, ...plan.checkpointData.score },
  });
  assert.equal(restoredReport.total, expectedReport.total);
  assert.equal(restoredReport.rank, expectedReport.rank);
  assert.deepEqual(restoredReport.stats, expectedReport.stats);
  assert.deepEqual(restoredReport.unlocks, expectedReport.unlocks);

  const targeting = new Targeting();
  assert.equal(targeting.restoreCheckpoint(plan.checkpointData.targeting), true);
  assert.equal(targeting.corridorScore, 0.91,
    'the first live frame must not replace the historical corridor grade with zero');
  assert.deepEqual(targeting.checkpoint(), plan.checkpointData.targeting);
});

test('a legacy Enola checkpoint without a snapshot restarts at the score-safe takeoff', () => {
  assert.deepEqual(enolaResumePlan('return', null), {
    phase: 'takeoff',
    checkpointData: null,
    legacyFallback: true,
  });
});

test('Enola completion rank and unlocks are restricted to authored card copy', () => {
  const report = enolaCompletionReportFromSave({
    status: 'complete',
    rank: '<img src=x onerror=alert(1)>',
    score: 0.5,
    unlocks: [
      'Enola Squatch Flight Jacket',
      '<img src=x onerror=alert(1)>',
      'Enola Squatch Flight Jacket',
    ],
    payloadReleased: true,
    returnedHome: true,
  });
  assert.equal(report.rank, 'Mission Complete');
  assert.deepEqual(report.unlocks, ['Enola Squatch Flight Jacket']);
});
