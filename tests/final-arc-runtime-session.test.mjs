import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSilverCaseCampaignStory } from '../src/core/final-arc-story.js';
import {
  createCartelPalaceCampaignStory,
  createEnolaSquatchCampaignStory,
  createMansionSiegeCampaignStory,
} from '../src/core/final-arc-story.js';
import {
  createFinalArcRuntimeSession,
  restoreCompletedFinalArcEntry,
} from '../src/core/final-arc-runtime.js';
import {
  checkpointForSilverCaseBeat,
  silverCaseCampaignReport,
  silverCaseResumeCheckpoint,
} from '../src/silvercase/campaign.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('a final-arc runtime session claims, checkpoints, completes once, and transitions', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  });
  const assigned = [];
  const runtime = createFinalArcRuntimeSession({
    campaign,
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    storyFactory: createSilverCaseCampaignStory,
    location: { assign: (href) => assigned.push(href) },
  });

  assert.deepEqual(runtime.begin(), { ok: true, resumed: false });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
  });
  assert.equal(runtime.checkpoint('bathroom_ambush'), true);
  assert.equal(
    campaign.state.missions[MISSION_IDS.SILVER_CASE].checkpoint,
    'bathroom_ambush',
  );

  assert.equal(runtime.complete({ winstonOutcome: 'spared' }), true);
  assert.equal(runtime.complete({ winstonOutcome: 'player_killed' }), false);
  assert.equal(
    campaign.state.missions[MISSION_IDS.SILVER_CASE].winstonOutcome,
    'spared',
  );

  runtime.navigate(SCENE_IDS.MANSION, { spawn: 'gate' });
  assert.deepEqual(assigned, ['mansion.html']);
  assert.equal(campaign.state.scene.id, SCENE_IDS.MANSION);
});

test('a preview runtime session never constructs or writes campaign state', () => {
  let constructed = 0;
  const runtime = createFinalArcRuntimeSession({
    preview: true,
    sceneId: SCENE_IDS.SILVER_CASE,
    storyFactory: () => { constructed++; return null; },
  });

  assert.deepEqual(runtime.begin(), {
    ok: true,
    preview: true,
    resumed: false,
  });
  assert.equal(runtime.checkpoint('car_ride'), false);
  assert.equal(runtime.complete({}), false);
  assert.equal(runtime.navigate(SCENE_IDS.MANSION), false);
  assert.equal(constructed, 0);
});

test('an in-progress final-arc entry returns its durable checkpoint token', () => {
  const cases = [
    [
      MISSION_IDS.SILVER_CASE,
      SCENE_IDS.SILVER_CASE,
      'bathroom_ambush',
      createSilverCaseCampaignStory,
    ],
    [
      MISSION_IDS.MANSION_SIEGE,
      SCENE_IDS.MANSION_SIEGE,
      'briefed',
      createMansionSiegeCampaignStory,
      { checkpointSnapshot: null },
    ],
    [
      MISSION_IDS.ENOLA_SQUATCH,
      SCENE_IDS.ENOLA_SQUATCH,
      'preRelease',
      createEnolaSquatchCampaignStory,
      { checkpointSnapshot: null },
    ],
    [
      MISSION_IDS.CARTEL_PALACE,
      SCENE_IDS.CARTEL_PALACE,
      'betrayal',
      createCartelPalaceCampaignStory,
      { checkpointSnapshot: null },
    ],
  ];

  for (const [missionId, sceneId, checkpoint, storyFactory, extra = {}] of cases) {
    const campaign = createCampaign({ storage: new MemoryStorage() });
    campaign.update((state) => {
      state.missions[missionId].status = 'in_progress';
      state.missions[missionId].checkpoint = checkpoint;
    });
    const runtime = createFinalArcRuntimeSession({ campaign, sceneId, storyFactory });

    assert.deepEqual(runtime.begin(), {
      ok: true,
      resumed: true,
      checkpoint,
      ...extra,
    });
  }
});

test('an already-complete entry restores local UI without navigating or writing again', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_CASE].status = 'complete';
  });
  const assigned = [];
  const runtime = createFinalArcRuntimeSession({
    campaign,
    sceneId: SCENE_IDS.SILVER_CASE,
    storyFactory: createSilverCaseCampaignStory,
    location: { assign: (href) => assigned.push(href) },
  });
  const before = JSON.stringify(campaign.state);
  const entry = runtime.begin();
  let restored = 0;

  assert.deepEqual(entry, { ok: false, reason: 'already_complete' });
  assert.equal(restoreCompletedFinalArcEntry(entry, {
    restore: () => { restored++; },
  }), true);
  assert.equal(restored, 1);
  assert.equal(runtime.complete({ winstonOutcome: 'player_killed' }), false);
  assert.equal(JSON.stringify(campaign.state), before, 'reload restoration rewrote the save');
  assert.deepEqual(assigned, [], 'restoring the card auto-skipped without a player click');

  assert.equal(restoreCompletedFinalArcEntry(entry, {
    preview: true,
    restore: () => { restored++; },
  }), false);
  assert.equal(restored, 1, 'preview restoration exposed a campaign completion action');
});

test('Silver Case runtime beats map to durable checkpoints and an honest outcome', () => {
  assert.equal(checkpointForSilverCaseBeat('CAR_RIDE'), 'car_ride');
  assert.equal(checkpointForSilverCaseBeat('ENTER_APARTMENT'), 'apartment');
  assert.equal(checkpointForSilverCaseBeat('BATHROOM_AMBUSH'), 'bathroom_ambush');
  assert.equal(checkpointForSilverCaseBeat('PICK_UP_CASE'), 'case_recovered');
  assert.equal(checkpointForSilverCaseBeat('FAILED'), null);

  assert.deepEqual(silverCaseCampaignReport({
    winstonAlive: false,
    flags: {
      irritatedApe: true,
      apeFinishedChester: false,
      apeFinishedWinston: true,
    },
  }), {
    winstonOutcome: 'ape_killed',
    irritatedApe: true,
    apeFinishedChester: false,
    apeFinishedWinston: true,
  });
});

test('Silver Case durable checkpoints map onto playable local restore beats', () => {
  assert.equal(silverCaseResumeCheckpoint('car_ride'), 'car');
  assert.equal(silverCaseResumeCheckpoint('hallway'), 'hallway');
  assert.equal(silverCaseResumeCheckpoint('apartment'), 'room');
  assert.equal(silverCaseResumeCheckpoint('case_reveal'), 'room');
  assert.equal(silverCaseResumeCheckpoint('bathroom_ambush'), 'prayer');
  assert.equal(silverCaseResumeCheckpoint('aftermath'), 'aftermath');
  assert.equal(silverCaseResumeCheckpoint('case_recovered'), 'case_recovered');
  for (const winstonOutcome of ['spared', 'player_killed', 'ape_killed']) {
    assert.equal(
      silverCaseResumeCheckpoint('case_recovered', { winstonOutcome }),
      'case_recovered',
    );
  }
  assert.equal(
    silverCaseResumeCheckpoint('case_recovered', { winstonOutcome: null }),
    'aftermath',
    'a legacy save with no final branch must replay the unresolved choice',
  );
  assert.equal(silverCaseResumeCheckpoint('not_real'), null);
});

test('Silver Case case-recovered checkpoints preserve every Winston branch across reload', () => {
  const outcomes = [
    {
      outcome: 'spared',
      winstonAlive: true,
      flags: {
        irritatedApe: false,
        apeFinishedChester: false,
        apeFinishedWinston: false,
      },
    },
    {
      outcome: 'player_killed',
      winstonAlive: false,
      flags: {
        irritatedApe: true,
        apeFinishedChester: false,
        apeFinishedWinston: false,
      },
    },
    {
      outcome: 'ape_killed',
      winstonAlive: false,
      flags: {
        irritatedApe: true,
        apeFinishedChester: true,
        apeFinishedWinston: true,
      },
    },
  ];

  for (const branch of outcomes) {
    const storage = new MemoryStorage();
    const campaign = createCampaign({ storage });
    campaign.update((state) => {
      state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
    });
    const runtime = createFinalArcRuntimeSession({
      campaign,
      sceneId: SCENE_IDS.SILVER_CASE,
      spawn: 'car_ride',
      storyFactory: createSilverCaseCampaignStory,
    });
    runtime.begin();

    const facts = silverCaseCampaignReport(branch);
    assert.equal(runtime.checkpoint('case_recovered', facts), true);

    const reloadedCampaign = createCampaign({ storage });
    const reloaded = createFinalArcRuntimeSession({
      campaign: reloadedCampaign,
      sceneId: SCENE_IDS.SILVER_CASE,
      spawn: 'car_ride',
      storyFactory: createSilverCaseCampaignStory,
    });
    assert.deepEqual(reloaded.begin(), {
      ok: true,
      resumed: true,
      checkpoint: 'case_recovered',
    });
    assert.deepEqual({
      winstonOutcome: reloaded.story.mission.winstonOutcome,
      irritatedApe: reloaded.story.mission.irritatedApe,
      apeFinishedChester: reloaded.story.mission.apeFinishedChester,
      apeFinishedWinston: reloaded.story.mission.apeFinishedWinston,
    }, facts, `${branch.outcome} changed during reload`);
  }
});

test('Silver Case completion cannot downgrade facts already saved by checkpoints', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  });
  const runtime = createFinalArcRuntimeSession({
    campaign,
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    storyFactory: createSilverCaseCampaignStory,
  });
  runtime.begin();
  runtime.checkpoint('aftermath', {
    irritatedApe: true,
    apeFinishedChester: true,
  });
  runtime.checkpoint('case_recovered', {
    winstonOutcome: 'ape_killed',
    apeFinishedWinston: true,
  });
  assert.equal(runtime.complete({
    winstonOutcome: 'not_a_branch',
    irritatedApe: false,
    apeFinishedChester: false,
    apeFinishedWinston: false,
  }), true);
  assert.deepEqual({
    winstonOutcome: runtime.story.mission.winstonOutcome,
    irritatedApe: runtime.story.mission.irritatedApe,
    apeFinishedChester: runtime.story.mission.apeFinishedChester,
    apeFinishedWinston: runtime.story.mission.apeFinishedWinston,
  }, {
    winstonOutcome: 'ape_killed',
    irritatedApe: true,
    apeFinishedChester: true,
    apeFinishedWinston: true,
  });
});

test('Cartel Palace checkpoints preserve partial evidence, alarm, targets, and hard-exit outcome', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
  });
  const runtime = createFinalArcRuntimeSession({
    campaign,
    sceneId: SCENE_IDS.CARTEL_PALACE,
    spawn: 'approach',
    storyFactory: createCartelPalaceCampaignStory,
  });
  runtime.begin();
  runtime.checkpoint('estate', {
    evidenceFound: ['sauce_belongings', 'not_evidence'],
  });
  runtime.checkpoint('estate', {
    evidenceFound: ['sauce_payment_ledger'],
    alarmRaised: true,
    alarmReason: 'guard_contact',
  });
  runtime.checkpoint('dining_room', {
    evidenceFound: ['sauce_security_still'],
    sauceBetrayalConfirmed: true,
    markEliminated: true,
  });
  runtime.checkpoint('clear', {
    sauceEliminated: true,
    alarmRaised: true,
    alarmReason: 'guard_contact',
    outcome: 'hard_exit',
  });

  const reloadedCampaign = createCampaign({ storage });
  const reloaded = createFinalArcRuntimeSession({
    campaign: reloadedCampaign,
    sceneId: SCENE_IDS.CARTEL_PALACE,
    spawn: 'approach',
    storyFactory: createCartelPalaceCampaignStory,
  });
  assert.deepEqual(reloaded.begin(), {
    ok: true,
    resumed: true,
    checkpoint: 'clear',
    checkpointSnapshot: null,
  });
  assert.deepEqual(reloaded.story.mission.evidenceFound, [
    'sauce_belongings',
    'sauce_payment_ledger',
    'sauce_security_still',
  ]);
  assert.equal(reloaded.story.mission.alarmRaised, true);
  assert.equal(reloaded.story.mission.alarmReason, 'guard_contact');
  assert.equal(reloaded.story.mission.markEliminated, true);
  assert.equal(reloaded.story.mission.sauceEliminated, true);
  assert.equal(reloaded.story.mission.outcome, 'hard_exit');
});
