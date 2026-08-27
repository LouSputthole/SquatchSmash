import {
  AIRSTRIP_UNLOCKS,
  BANK_HEIST_CHECKPOINT_IDS,
  CARTEL_PALACE_EVIDENCE_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  SILENT_SQUATCH_CHECKPOINT_IDS,
  TIME_EVENT_IDS,
  missionHomecoming,
  navigateCampaign,
} from './campaign.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from './bada-bing-two-story.js';
import { createAirstripStory } from './airstrip-story.js';
import { createBankHeistStory } from './bank-heist-story.js';
import {
  createCartelPalaceCampaignStory,
  createEnolaSquatchCampaignStory,
  createMansionReturnCampaignStory,
  createMansionSiegeCampaignStory,
  createSilverCaseCampaignStory,
} from './final-arc-story.js';
import { createGolfStory } from './golf-story.js';
import { createGraveyardStory } from './graveyard-story.js';
import { createMotelStory } from './motel-story.js';
import { createNoWakeStory } from './no-wake-story.js';
import { createSilverStory } from './silver-story.js';
import { createSilentSquatchStory } from './silent-squatch-story.js';
import { createSquatchfatherStory } from './squatchfather-story.js';
import { createSceneRecovery } from './scene-recovery.js';

/**
 * Scenes whose page offers RESTART SCENE -- the destructive one, which rewinds
 * durable mission facts to the authored scene start and reloads.
 *
 * This is NOT the same inventory as the Skip Scene maps below, and the two are
 * allowed to differ. A scene belongs here only if `resetCampaignScene` has
 * something real to put back: a mission record with checkpoints, flags and
 * inventory that the scene wrote on its way through.
 *
 * THE SPECIAL MEETING IS DELIBERATELY NOT ON THIS LIST. It is the one campaign
 * scene with no mission record at all -- there is no `MISSION_IDS` entry for
 * it, because nothing in it can be done well or badly. The player is collected
 * in a car, driven, and let out at a spur; the only durable thing the scene
 * writes is its exact-once completion/departure pair and Initiation's status;
 * exact-once events cannot be rewound (same reason MANSION_RETURN's branch in
 * `resetCampaignScene` refuses to touch a completed briefing). A Restart Scene
 * entry here would therefore be a destructive cross-scene rewind, not a local
 * reset. So the Special Meeting gets the SKIP adapter and not the RESTART one.
 * See its entries in DESTINATIONS, COMPLETERS and CANONICAL_COMPLETIONS below.
 */
export const RECOVERABLE_CAMPAIGN_SCENES = Object.freeze([
  SCENE_IDS.BADA_BING_ONE,
  SCENE_IDS.SQUATCHFATHER,
  SCENE_IDS.AIRSTRIP_SMUGGLING,
  SCENE_IDS.BADA_BING_TWO,
  SCENE_IDS.SQUATCH_GRAVEYARD,
  SCENE_IDS.JERKY_MOTEL,
  SCENE_IDS.NO_WAKE,
  SCENE_IDS.SILVER_ROOM,
  SCENE_IDS.SILVER_PINES,
  SCENE_IDS.BANK_HEIST,
  SCENE_IDS.SILVER_CASE,
  SCENE_IDS.MANSION,
  SCENE_IDS.MANSION_SIEGE,
  SCENE_IDS.ENOLA_SQUATCH,
  SCENE_IDS.MANSION_RETURN,
  SCENE_IDS.CARTEL_PALACE,
]);

/**
 * THE TWO SCENES THE ACT-ONE CABIN SITS BETWEEN.
 *
 * The Squatchfather's driver takes him out of town, and Sasole runs him back
 * to the property he collected him from -- so neither of these ends at the
 * flat while the cabin chapter is open. The cabin is a scene rather than a
 * mission, so its progress is read off the clock ledger, which is where that
 * chapter actually keeps its state: the Booski/Sasole call opens it and the
 * Booski/Billy call closes it.
 *
 * A skip that ignored this would put a dev straight home from the restaurant
 * and quietly strand the whole of beats 4 to 7 behind a scene nobody visits.
 */
/* `travelEvent` is the hour the journey itself costs. A skip stands in for a
 * drive the player would otherwise have made, so it has to cost the same. */
const CABIN_ARRIVAL = Object.freeze({
  sceneId: SCENE_IDS.COUNTRYSIDE_CABIN,
  spawn: 'arrival',
  travelEvent: TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW,
});
const CABIN_RETURN = Object.freeze({
  sceneId: SCENE_IDS.COUNTRYSIDE_CABIN,
  spawn: 'arrival',
  travelEvent: TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP,
});
const APARTMENT_HOME = Object.freeze({ sceneId: SCENE_IDS.APARTMENT, spawn: 'front_door' });



function cabinChapterDone(campaign) {
  return campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL);
}

const DESTINATIONS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: { sceneId: SCENE_IDS.APARTMENT, spawn: 'front_door' },
  /* Beat 3's exit: out of town, unless the cabin is already behind him. */
  [SCENE_IDS.SQUATCHFATHER]: (campaign) => (
    cabinChapterDone(campaign) ? APARTMENT_HOME : CABIN_ARRIVAL
  ),
  /* Beat 6 ends where it started, but only while the chapter is open. */
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: (campaign) => (
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL)
      && !cabinChapterDone(campaign)
      ? CABIN_RETURN : APARTMENT_HOME
  ),
  [SCENE_IDS.BADA_BING_TWO]: { sceneId: SCENE_IDS.SQUATCH_GRAVEYARD, spawn: 'headlights' },
  [SCENE_IDS.SQUATCH_GRAVEYARD]: { sceneId: SCENE_IDS.JERKY_MOTEL, spawn: 'passenger_seat' },
  [SCENE_IDS.JERKY_MOTEL]: { sceneId: SCENE_IDS.APARTMENT, spawn: 'front_door' },
  /* BEATS 13, 15 and 18 ALL END AT THE NEW ADDRESS.
   *
   * All three used to end at the starter flat, and all three were the old
   * order: the round and the date were played before the handover, and NO
   * WAKE was the first job of a morning three beats earlier than the bible
   * puts it. The Home Ladder climbs at Silver Pines and never comes back
   * down, so from the eighteenth green onward "home" means one place.
   *
   * Read from `missionHomecoming` rather than restated, because the played
   * ending cards read the same table -- see the note on it in campaign.js.
   * A skip that landed somewhere the finished mission does not would stop
   * being a test of the real route. */
  [SCENE_IDS.NO_WAKE]: missionHomecoming(SCENE_IDS.NO_WAKE),
  [SCENE_IDS.SILVER_ROOM]: missionHomecoming(SCENE_IDS.SILVER_ROOM),
  [SCENE_IDS.SILVER_PINES]: missionHomecoming(SCENE_IDS.SILVER_PINES),
  [SCENE_IDS.BANK_HEIST]: { sceneId: SCENE_IDS.APARTMENT, spawn: 'front_door' },
  [SCENE_IDS.SILVER_CASE]: { sceneId: SCENE_IDS.MANSION, spawn: 'gate' },
  [SCENE_IDS.MANSION]: { sceneId: SCENE_IDS.MANSION_SIEGE, spawn: 'guest_suite' },
  [SCENE_IDS.MANSION_SIEGE]: { sceneId: SCENE_IDS.ENOLA_SQUATCH, spawn: 'airfield' },
  [SCENE_IDS.ENOLA_SQUATCH]: { sceneId: SCENE_IDS.MANSION_RETURN, spawn: 'driveway' },
  [SCENE_IDS.MANSION_RETURN]: { sceneId: SCENE_IDS.CARTEL_PALACE, spawn: 'approach' },
  /* The Palace goes HOME, before the pickup.
   *
   * Act One of the Special Meeting is playable in Apartment: Booskibro's call,
   * getting ready, the refused door and the arriving headlights. A recovery
   * skip must preserve that same route instead of becoming a story bypass. */
  [SCENE_IDS.CARTEL_PALACE]: { sceneId: SCENE_IDS.APARTMENT, spawn: 'front_door' },
  /* THE SPECIAL MEETING -> INITIATION NIGHT, at the `gathering` spawn.
   *
   * The same hand-off the scene performs for itself when it is played: see
   * `handOff()` in `src/specialmeeting/main.js`, which fades out at the
   * treeline and navigates to exactly this scene and spawn. Skip Scene must
   * land the player where finishing the scene would have, not somewhere more
   * convenient, or the developer affordance stops testing the real route.
   *
   * It is also the scene's only outgoing edge (`SCENES[SPECIAL_MEETING].next`
   * is `[INITIATION]`), so `campaign.transition` accepts it. */
  [SCENE_IDS.SPECIAL_MEETING]: { sceneId: SCENE_IDS.INITIATION, spawn: 'gathering' },
});

const ADVANCED_MISSION_STATUSES = Object.freeze(['available', 'in_progress', 'complete']);

function missionIsUnlocked(mission) {
  return ADVANCED_MISSION_STATUSES.includes(mission?.status);
}

function hasCanonicalBadaBingOneEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BADA_BING_ONE];
  return mission.status === 'complete'
    && mission.packageReceived === true
    && typeof mission.ending === 'string'
    && mission.ending.trim().length > 0
    && campaign.hasItem(ITEM_IDS.LOU_PACKAGE)
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.SQUATCHFATHER]);
}

function hasCanonicalSquatchfatherEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.SQUATCHFATHER];
  return mission.status === 'complete'
    && mission.weaponStaged === true
    && mission.weaponDropped === true;
}

function hasCanonicalAirstripEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  return mission.status === 'complete'
    && mission.checkpoint === 'landed_home'
    && mission.cargoLoaded === true
    && typeof mission.landingQuality === 'string';
}

function hasCanonicalClubEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  const bodyReady = mission.attackResolved === true
    && BADA_BING_TWO_CLEANUP_TASKS.every((task) => mission.cleanupTasks.includes(task))
    && mission.bodyWrapped === true
    && mission.bodyLoaded === true
    && typeof mission.assignment === 'string'
    && mission.assignment.trim().length > 0;
  return bodyReady && (
    (mission.status === 'in_progress' && mission.checkpoint === 'body_loaded')
    || (mission.status === 'complete'
      && mission.checkpoint === 'buried'
      && mission.burialComplete === true)
  );
}

function hasCanonicalGraveyardEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  return mission.status === 'complete'
    && mission.checkpoint === 'buried'
    && mission.bodyWrapped === true
    && mission.bodyLoaded === true
    && mission.burialComplete === true
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.JERKY_MOTEL]);
}

function hasCanonicalMotelEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.JERKY_MOTEL];
  return mission.status === 'complete' && mission.ending === 'home';
}

function hasCanonicalNoWakeEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.NO_WAKE];
  return mission.status === 'complete'
    && mission.checkpoint === 'returned'
    && mission.betrayalConfirmed === true
    && mission.playerFired === true
    && mission.bodyDisposed === true;
}

function hasCanonicalSilverRoomEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.SILVER_ROOM];
  return mission.status === 'complete'
    && typeof mission.outcome === 'string'
    && mission.outcome.trim().length > 0;
}

function hasCanonicalGolfEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.SILVER_PINES];
  return mission.status === 'complete'
    && mission.holesPlayed >= 3
    && Array.isArray(mission.holes)
    && mission.holes.length >= 3;
}

function hasCanonicalBankHeistEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  return mission.status === 'complete'
    && mission.checkpoint === 'vehicle_swap'
    && mission.vaultOpened === true
    && mission.crewSurvived === true
    && mission.cleanup?.finalCalls === true
    && typeof mission.outcome === 'string'
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.SILVER_CASE]);
}

function hasCanonicalSilverCaseEnding(campaign) {
  const state = campaign.state;
  const mission = state.missions[MISSION_IDS.SILVER_CASE];
  const silent = state.missions[MISSION_IDS.SILENT_SQUATCH];
  const caseAccountedFor = campaign.hasItem(ITEM_IDS.SILVER_CASE)
    || ['in_progress', 'complete'].includes(silent.status);
  return mission.status === 'complete'
    && mission.checkpoint === 'case_recovered'
    && mission.caseRecovered === true
    && missionIsUnlocked(silent)
    && caseAccountedFor;
}

function hasCompletedSilentSquatchNight(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.SILENT_SQUATCH];
  return mission.status === 'complete'
    && mission.checkpoint === 'clear'
    && mission.basementUnlocked === true
    && mission.notesRecovered === true
    && mission.conspiracyBoard === true
    && mission.trophyAwarded === true
    && mission.eveningReady === true;
}

function hasCanonicalMansionEnding(campaign) {
  return hasCompletedSilentSquatchNight(campaign)
    && campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].sleptAtMansion === true
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.MANSION_SIEGE]);
}

function hasCanonicalMansionSiegeEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.MANSION_SIEGE];
  return mission.status === 'complete'
    && mission.checkpoint === 'wave_one'
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.ENOLA_SQUATCH]);
}

function hasCanonicalEnolaEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.ENOLA_SQUATCH];
  return mission.status === 'complete'
    && mission.checkpoint === 'return'
    && mission.returnedHome === true
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.MANSION_RETURN]);
}

function hasCanonicalMansionReturnEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.MANSION_RETURN];
  return mission.status === 'complete'
    && mission.briefingComplete === true
    && mission.wrongCityConfirmed === true
    && mission.sauceMissingConfirmed === true
    && mission.palaceLocationKnown === true
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.CARTEL_PALACE]);
}

function hasCanonicalCartelEnding(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.CARTEL_PALACE];
  return mission.status === 'complete'
    && mission.checkpoint === 'clear'
    && mission.sauceBetrayalConfirmed === true
    && mission.markEliminated === true
    && mission.sauceEliminated === true
    && missionIsUnlocked(campaign.state.missions[MISSION_IDS.INITIATION]);
}

/**
 * THE SPECIAL MEETING has finished exactly when its clock says it has.
 *
 * Every other scene on this page proves its ending out of a mission record.
 * This one has none -- see the note on RECOVERABLE_CAMPAIGN_SCENES above --
 * so the durable fact that the drive happened is the exact-once
 * `COMPLETE_SPECIAL_MEETING` time event on the story ledger. That event is
 * what the scene itself commits in `handOff()`, and `advanceTime` refuses to
 * apply it twice, which is what makes it safe to read as the completion mark.
 *
 * The handoff's `DEPART_INITIATION` event and in-progress mission state are
 * checked as well. Palace completion only makes that mission available; the
 * Meeting owns the point where it actually begins.
 */
function hasCanonicalSpecialMeetingEnding(campaign) {
  return campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING)
    && campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_INITIATION)
    && ['in_progress', 'complete'].includes(
      campaign.state.missions[MISSION_IDS.INITIATION]?.status,
    );
}

function completeBadaBingOne(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BADA_BING_ONE];
  if (mission.status !== 'in_progress') return false;
  campaign.update((state) => {
    const done = state.missions[MISSION_IDS.BADA_BING_ONE];
    done.status = 'complete';
    done.packageReceived = true;
    done.ending = 'followed';
    state.inventory.carried = state.inventory.carried.filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
    if (!state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE)) {
      state.inventory.concealed.push(ITEM_IDS.LOU_PACKAGE);
    }
    if (state.missions[MISSION_IDS.SQUATCHFATHER].status === 'locked') {
      state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
    }
  });
  return true;
}

function completeAirstrip(campaign) {
  const story = createAirstripStory({ campaign });
  let mission = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  if (mission.status !== 'in_progress') return false;
  if (mission.checkpoint === 'airstrip') story.checkpoint('remote_strip');
  mission = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  if (mission.checkpoint === 'remote_strip' && !mission.cargoLoaded) story.loadCargo();
  mission = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  if (mission.checkpoint === 'remote_strip') story.checkpoint('returning');
  mission = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  if (mission.checkpoint === 'returning') story.checkpoint('landed_home');
  return story.complete({
    landingQuality: 'clean',
    rank: 'Recovery completion',
    unlocks: AIRSTRIP_UNLOCKS.slice(0, 3),
    packagesDelivered: 3,
    gunsDelivered: 4,
  });
}

function completeHotDogClub(campaign) {
  const story = createBadaBingTwoStory({ campaign });
  let mission = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  if (mission.status !== 'in_progress') return false;
  if (mission.checkpoint === 'body_loaded' && mission.bodyWrapped && mission.bodyLoaded) return true;
  if (!mission.attackResolved) story.recordAttack({ attackResolved: true });
  for (const task of BADA_BING_TWO_CLEANUP_TASKS) story.recordCleanup(task);
  mission = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  return story.completeClub({
    assignment: mission.assignment || 'reserve_pickup',
    bodyWrapped: true,
    bodyLoaded: true,
  });
}

function completeGraveyard(campaign) {
  const mission = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  if (mission.status === 'complete' && mission.burialComplete) return true;
  const story = createGraveyardStory({ campaign });
  if (mission.checkpoint === 'body_loaded' && story.begin()?.ok !== true) return false;
  const completed = story.complete({ bodyBuried: true });
  if (completed) campaign.advanceTime(TIME_EVENT_IDS.DEPART_JERKY_MOTEL);
  return completed;
}

function completeMotel(campaign) {
  return createMotelStory({ campaign }).complete({
    ending: 'home',
    cargoRecovered: true,
    packagesIntact: 8,
    freshness: 100,
    policeHeat: 0,
  });
}

function completeNoWake(campaign) {
  return createNoWakeStory({ campaign }).complete({
    betrayalConfirmed: true,
    playerFired: true,
    bodyDisposed: true,
  });
}

function completeSilverRoom(campaign) {
  return createSilverStory({ campaign }).complete({
    outcome: 'perfect',
    woo: 100,
    band: 'perfect',
    tippedEverybody: true,
    rememberedDrink: true,
    seeingHerAgain: true,
    cameHome: true,
    date: { knowsWhatHeDoes: true },
  });
}

function completeGolf(campaign) {
  const story = createGolfStory({ campaign });
  const existing = new Set(story.mission.holes.map((hole) => hole.hole));
  for (let hole = 1; hole <= 3; hole++) {
    if (!existing.has(hole)) story.recordHole({
      hole,
      par: 3,
      strokes: 3,
      penalties: 0,
      hitGreenInRegulation: true,
      heardInvitation: hole === 3,
      rodeWithLou: hole === 3,
    });
  }
  return story.complete({ holes: story.mission.holes });
}

const HEIST_CHECKPOINT_FACTS = Object.freeze({
  safehouse_ready: {},
  bank_secured: { guardsDisarmed: 2, civiliansHarmed: 0 },
  vault_open: { alarmTriggered: false, bagsStaged: 7 },
  street_withdrawal: { primaryVanLost: true, policeHeat: 0 },
  mercer_garage: { bagsRecovered: 7, crewInjuries: {}, droppedBagRecovered: false },
  vehicle_swap: { playerDroveEscape: true, vehicleDamage: 0 },
});

function completeBankHeist(campaign) {
  const story = createBankHeistStory({ campaign });
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  if (mission.status !== 'in_progress') return false;
  const current = BANK_HEIST_CHECKPOINT_IDS.indexOf(mission.checkpoint);
  for (const id of BANK_HEIST_CHECKPOINT_IDS.slice(current + 1)) {
    if (!story.checkpoint(id, HEIST_CHECKPOINT_FACTS[id])) return false;
  }
  return story.complete({
    bagsStaged: 7,
    bagsRecovered: 7,
    grossTake: 1_470_000,
    compromisedCash: 0,
    crewInjuries: {},
    optionalVaultBagTaken: false,
    civiliansHarmed: 0,
    disciplinedFire: true,
    followedSnow: true,
    outcome: 'professional',
  });
}

function completeSilverCase(campaign) {
  const story = createSilverCaseCampaignStory({ campaign });
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  return story.complete({
    winstonOutcome: 'spared',
    irritatedApe: false,
    apeFinishedChester: false,
    apeFinishedWinston: false,
  });
}

function completeMansion(campaign) {
  const story = createSilentSquatchStory({ campaign });
  if (hasCompletedSilentSquatchNight(campaign)) {
    if (!story.mission.sleptAtMansion) return story.restAtMansion()?.ok === true;
    return missionIsUnlocked(campaign.state.missions[MISSION_IDS.MANSION_SIEGE]);
  }
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  for (const checkpoint of SILENT_SQUATCH_CHECKPOINT_IDS) {
    if (checkpoint === 'clear') continue;
    story.checkpoint(checkpoint, { scientistsLost: 6 });
  }
  if (story.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['armed', 'released'],
    collapsed: ['one', 'two', 'three', 'four', 'five'],
  }) !== true) return false;
  return story.restAtMansion()?.ok === true;
}

function completeMansionSiege(campaign) {
  const story = createMansionSiegeCampaignStory({ campaign });
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  return story.complete({
    attackersDown: 8,
    littleFriendSaid: true,
    sasoleMet: true,
  });
}

function completeEnola(campaign) {
  const story = createEnolaSquatchCampaignStory({ campaign });
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  return story.complete({
    rank: 'Recovery completion',
    score: 0,
    unlocks: [],
    payloadReleased: true,
    returnedHome: true,
  });
}

function completeMansionReturn(campaign) {
  const story = createMansionReturnCampaignStory({ campaign });
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  return story.complete({
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  });
}

function completeCartelPalace(campaign) {
  const story = createCartelPalaceCampaignStory({ campaign });
  if (story.mission.status !== 'in_progress' && story.begin()?.ok !== true) return false;
  return story.complete({
    evidenceFound: [...CARTEL_PALACE_EVIDENCE_IDS],
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: 'clean',
  });
}

/**
 * Commit the Special Meeting's ending through the same seam the played scene
 * uses.
 *
 * There is no story module to drive, but there are two exact-once facts: the
 * Meeting completed, then Initiation began at the treeline. The played handoff
 * writes the same pair in `src/specialmeeting/main.js`; the recovery skip must
 * not leave the next mission merely available after navigating into it.
 */
function completeSpecialMeeting(campaign) {
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (state) => {
    if (state.missions[MISSION_IDS.INITIATION].status === 'available') {
      state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
    }
  }, { required: true });
  return hasCanonicalSpecialMeetingEnding(campaign);
}

const COMPLETERS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: completeBadaBingOne,
  [SCENE_IDS.SQUATCHFATHER]: (campaign) => createSquatchfatherStory({ campaign }).complete(),
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: completeAirstrip,
  [SCENE_IDS.BADA_BING_TWO]: completeHotDogClub,
  [SCENE_IDS.SQUATCH_GRAVEYARD]: completeGraveyard,
  [SCENE_IDS.JERKY_MOTEL]: completeMotel,
  [SCENE_IDS.NO_WAKE]: completeNoWake,
  [SCENE_IDS.SILVER_ROOM]: completeSilverRoom,
  [SCENE_IDS.SILVER_PINES]: completeGolf,
  [SCENE_IDS.BANK_HEIST]: completeBankHeist,
  [SCENE_IDS.SILVER_CASE]: completeSilverCase,
  [SCENE_IDS.MANSION]: completeMansion,
  [SCENE_IDS.MANSION_SIEGE]: completeMansionSiege,
  [SCENE_IDS.ENOLA_SQUATCH]: completeEnola,
  [SCENE_IDS.MANSION_RETURN]: completeMansionReturn,
  [SCENE_IDS.CARTEL_PALACE]: completeCartelPalace,
  [SCENE_IDS.SPECIAL_MEETING]: completeSpecialMeeting,
});

const CANONICAL_COMPLETIONS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: hasCanonicalBadaBingOneEnding,
  [SCENE_IDS.SQUATCHFATHER]: hasCanonicalSquatchfatherEnding,
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: hasCanonicalAirstripEnding,
  [SCENE_IDS.BADA_BING_TWO]: hasCanonicalClubEnding,
  [SCENE_IDS.SQUATCH_GRAVEYARD]: hasCanonicalGraveyardEnding,
  [SCENE_IDS.JERKY_MOTEL]: hasCanonicalMotelEnding,
  [SCENE_IDS.NO_WAKE]: hasCanonicalNoWakeEnding,
  [SCENE_IDS.SILVER_ROOM]: hasCanonicalSilverRoomEnding,
  [SCENE_IDS.SILVER_PINES]: hasCanonicalGolfEnding,
  [SCENE_IDS.BANK_HEIST]: hasCanonicalBankHeistEnding,
  [SCENE_IDS.SILVER_CASE]: hasCanonicalSilverCaseEnding,
  [SCENE_IDS.MANSION]: hasCanonicalMansionEnding,
  [SCENE_IDS.MANSION_SIEGE]: hasCanonicalMansionSiegeEnding,
  [SCENE_IDS.ENOLA_SQUATCH]: hasCanonicalEnolaEnding,
  [SCENE_IDS.MANSION_RETURN]: hasCanonicalMansionReturnEnding,
  [SCENE_IDS.CARTEL_PALACE]: hasCanonicalCartelEnding,
  [SCENE_IDS.SPECIAL_MEETING]: hasCanonicalSpecialMeetingEnding,
});

function resetCampaignScene(campaign, sceneId) {
  if (!RECOVERABLE_CAMPAIGN_SCENES.includes(sceneId)
    || campaign.state.scene.id !== sceneId) return false;
  campaign.update((state) => {
    if (sceneId === SCENE_IDS.BADA_BING_ONE) {
      Object.assign(state.missions[MISSION_IDS.BADA_BING_ONE], {
        status: 'in_progress', packageReceived: false, ending: null,
      });
      state.inventory.carried = state.inventory.carried.filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
      state.inventory.concealed = state.inventory.concealed.filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
      return;
    }
    if (sceneId === SCENE_IDS.SQUATCHFATHER) {
      Object.assign(state.missions[MISSION_IDS.SQUATCHFATHER], {
        status: 'in_progress', weaponStaged: true, weaponDropped: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.AIRSTRIP_SMUGGLING) {
      Object.assign(state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING], {
        status: 'in_progress', checkpoint: 'airstrip', cargoLoaded: false,
        detected: false, landingQuality: null, rank: null, unlocks: [],
        packagesDelivered: 0, gunsDelivered: 0,
      });
      return;
    }
    if (sceneId === SCENE_IDS.BADA_BING_TWO) {
      Object.assign(state.missions[MISSION_IDS.BADA_BING_TWO], {
        status: 'in_progress', checkpoint: 'party', assignment: null,
        attackResolved: false, cleanupTasks: [], bodyWrapped: false,
        bodyLoaded: false, burialComplete: false, echoHeard: false,
        inspectedGraves: [], respectedGraves: [], urinatedOn: [],
      });
      return;
    }
    if (sceneId === SCENE_IDS.SQUATCH_GRAVEYARD) {
      Object.assign(state.missions[MISSION_IDS.BADA_BING_TWO], {
        status: 'in_progress', checkpoint: 'body_loaded', assignment: 'reserve_pickup',
        attackResolved: true, cleanupTasks: [...BADA_BING_TWO_CLEANUP_TASKS],
        bodyWrapped: true, bodyLoaded: true, burialComplete: false,
        echoHeard: false, inspectedGraves: [], respectedGraves: [], urinatedOn: [],
      });
      return;
    }
    if (sceneId === SCENE_IDS.JERKY_MOTEL) {
      Object.assign(state.missions[MISSION_IDS.JERKY_MOTEL], {
        status: 'in_progress', ending: null, cargoRecovered: false,
        packagesIntact: 0, freshness: 0, policeHeat: 0,
      });
      return;
    }
    if (sceneId === SCENE_IDS.NO_WAKE) {
      Object.assign(state.missions[MISSION_IDS.NO_WAKE], {
        status: 'in_progress', checkpoint: 'dock', betrayalConfirmed: false,
        playerFired: false, bodyDisposed: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.SILVER_ROOM) {
      Object.assign(state.missions[MISSION_IDS.SILVER_ROOM], {
        status: 'in_progress', outcome: null, woo: 0, band: null,
        tippedEverybody: false, rememberedDrink: false, seeingHerAgain: false,
        knowsWhatHeDoes: false, cameHome: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.SILVER_PINES) {
      Object.assign(state.missions[MISSION_IDS.SILVER_PINES], {
        status: 'in_progress', holesPlayed: 0, strokes: 0, penalties: 0,
        toPar: 0, holes: [], heardInvitation: false, rodeWithLou: false,
        ace: false, foundWater: false, hitGreenInRegulation: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.BANK_HEIST) {
      const heist = state.missions[MISSION_IDS.BANK_HEIST];
      Object.assign(heist, {
        status: 'in_progress', checkpoint: null, briefingComplete: false,
        cleanupComplete: false, bankEntered: false, civiliansHarmed: 0,
        guardsDisarmed: 0, alarmTriggered: false, vaultOpened: false,
        bagsStaged: 0, bagsRecovered: 0, grossTake: 0, compromisedCash: 0,
        operationalLoss: 0, familyShare: 0, crewShare: 0, prospectShare: 0,
        playerInjury: 'none', primaryVanLost: false, droppedBagRecovered: false,
        optionalVaultBagTaken: false, playerDroveEscape: false, vehicleDamage: 0,
        policeHeat: 0, crewSurvived: true, followedSnow: true,
        disciplinedFire: true, outcome: null,
      });
      heist.cleanup = { washed: false, changed: false, gearSecured: false, finalCalls: false };
      heist.crewInjuries = Object.fromEntries(
        Object.keys(heist.crewInjuries ?? {}).map((id) => [id, 'none']),
      );
      return;
    }
    if (sceneId === SCENE_IDS.SILVER_CASE) {
      Object.assign(state.missions[MISSION_IDS.SILVER_CASE], {
        status: 'in_progress', checkpoint: null, caseRecovered: false,
        winstonOutcome: null, irritatedApe: false, apeFinishedChester: false,
        apeFinishedWinston: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.MANSION) {
      const silent = state.missions[MISSION_IDS.SILENT_SQUATCH];
      // The quiet mansion evening is part of this same page. Once the lab
      // mission is complete, a reload must reopen that evening with its earned
      // rewards intact; its exact-once completion event cannot be replayed.
      if (silent.status === 'complete') return;
      Object.assign(silent, {
        status: 'in_progress', checkpoint: null, casePlaced: false,
        caseDelivered: false, labLocked: false, aubbieEliminated: false,
        silentNightActivated: false, scientistsLost: 0,
        basementUnlocked: false, notesRecovered: false,
        conspiracyBoard: false, trophyAwarded: false,
        eveningReady: false, sleptAtMansion: false,
      });
      state.story.chapter = 'mansion';
      state.inventory.carried = state.inventory.carried
        .filter((id) => id !== ITEM_IDS.SQUATCHANIUM_MINIATURE);
      state.inventory.concealed = state.inventory.concealed
        .filter((id) => id !== ITEM_IDS.SQUATCHANIUM_MINIATURE && id !== ITEM_IDS.SILVER_CASE);
      if (!state.inventory.carried.includes(ITEM_IDS.SILVER_CASE)) {
        state.inventory.carried.push(ITEM_IDS.SILVER_CASE);
      }
      Object.assign(state.missions[MISSION_IDS.MANSION_SIEGE], {
        status: 'locked', checkpoint: null, attackersDown: 0,
        littleFriendSaid: false, sasoleMet: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.MANSION_SIEGE) {
      Object.assign(state.missions[MISSION_IDS.MANSION_SIEGE], {
        status: 'in_progress', checkpoint: null, attackersDown: 0,
        littleFriendSaid: false, sasoleMet: false,
      });
      state.story.chapter = 'mansion_siege';
      Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
        status: 'locked', checkpoint: null, checkpointSnapshot: null,
        rank: null, score: 0, unlocks: [], payloadReleased: false,
        returnedHome: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.ENOLA_SQUATCH) {
      Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
        status: 'in_progress', checkpoint: null, checkpointSnapshot: null,
        rank: null, score: 0, unlocks: [], payloadReleased: false,
        returnedHome: false,
      });
      return;
    }
    if (sceneId === SCENE_IDS.MANSION_RETURN) {
      // The completed briefing stays on this page as the departure state.
      // Preserve it: COMPLETE_MANSION_RETURN is an exact-once event, so
      // rewinding its facts would make the briefing impossible to re-finish.
      if (state.missions[MISSION_IDS.MANSION_RETURN].status === 'complete') return;
      Object.assign(state.missions[MISSION_IDS.MANSION_RETURN], {
        status: 'in_progress', briefingComplete: false,
        wrongCityConfirmed: false, sauceMissingConfirmed: false,
        palaceLocationKnown: false,
      });
      state.story.chapter = 'mansion_return';
      Object.assign(state.missions[MISSION_IDS.CARTEL_PALACE], {
        status: 'locked', checkpoint: null, evidenceFound: [],
        sauceBetrayalConfirmed: false, alarmRaised: false,
        alarmReason: null, markEliminated: false, sauceEliminated: false,
        outcome: null,
      });
      return;
    }
    if (sceneId === SCENE_IDS.CARTEL_PALACE) {
      Object.assign(state.missions[MISSION_IDS.CARTEL_PALACE], {
        status: 'in_progress', checkpoint: null, evidenceFound: [],
        sauceBetrayalConfirmed: false, alarmRaised: false, alarmReason: null,
        markEliminated: false, sauceEliminated: false, outcome: null,
      });
    }
  });
  return true;
}

export function createCampaignSceneRestartAdapter({
  campaign,
  sceneId,
  location = globalThis.location,
} = {}) {
  if (!campaign || !sceneId) throw new TypeError('Campaign scene restart requires campaign and sceneId');
  if (!RECOVERABLE_CAMPAIGN_SCENES.includes(sceneId)) return null;
  return function restartCampaignScene() {
    if (!resetCampaignScene(campaign, sceneId)) {
      return { ok: false, reason: 'scene_restart_refused' };
    }
    location?.reload?.();
    return { ok: true, sceneId };
  };
}

/**
 * Build the only callback `scene-recovery` is allowed to use for Skip Scene.
 * Every supported scene first commits its canonical outcome through the same
 * campaign story seam as normal gameplay. Navigation happens only after that
 * seam reports success.
 */
export function createCampaignSceneSkipAdapter({
  campaign,
  sceneId,
  location = globalThis.location,
} = {}) {
  if (!campaign || !sceneId) throw new TypeError('Campaign scene skip requires campaign and sceneId');
  const complete = COMPLETERS[sceneId];
  const isCanonicalCompletion = CANONICAL_COMPLETIONS[sceneId];
  /* A destination may be a function of campaign state -- see the two above. */
  const resolveDestination = DESTINATIONS[sceneId];
  if (!complete || !isCanonicalCompletion || !resolveDestination) return null;

  return function completeAndSkipScene() {
    if (campaign.state.scene.id !== sceneId) {
      return { ok: false, reason: 'scene_completion_refused' };
    }
    if (isCanonicalCompletion(campaign) !== true
      && (complete(campaign) !== true || isCanonicalCompletion(campaign) !== true)) {
      return { ok: false, reason: 'scene_completion_refused' };
    }
    const destination = typeof resolveDestination === 'function'
      ? resolveDestination(campaign) : resolveDestination;
    if (destination.travelEvent) campaign.advanceTime(destination.travelEvent);
    navigateCampaign(campaign, destination.sceneId, {
      spawn: destination.spawn,
      location,
    });
    return { ok: true, from: sceneId, to: destination.sceneId };
  };
}

/** Shared browser wiring: durable restart policy plus the guarded campaign skip. */
export function createCampaignSceneRecovery({
  campaign,
  sceneId,
  location = globalThis.location,
  restartCheckpoint = null,
  canRestartCheckpoint = () => typeof restartCheckpoint === 'function',
  restartScene = createCampaignSceneRestartAdapter({ campaign, sceneId, location }),
} = {}) {
  const restartCampaignCheckpoint = () => {
    if (typeof restartCheckpoint === 'function' && canRestartCheckpoint() === true) {
      return restartCheckpoint();
    }
    if (typeof location?.reload !== 'function') {
      return { ok: false, reason: 'checkpoint_unavailable' };
    }
    // Every persisted scene entry is checkpoint zero. Reloading it preserves
    // canonical mission facts; Restart Scene remains the distinct destructive
    // action that rewinds those facts to the authored scene start.
    location.reload();
    return { ok: true, checkpoint: 'scene_entry' };
  };

  return createSceneRecovery({
    sceneId,
    location,
    restartCheckpoint: restartCampaignCheckpoint,
    canRestartCheckpoint: () => typeof location?.reload === 'function'
      || (typeof restartCheckpoint === 'function' && canRestartCheckpoint() === true),
    restartScene,
    completeAndSkip: createCampaignSceneSkipAdapter({ campaign, sceneId, location }),
  });
}
