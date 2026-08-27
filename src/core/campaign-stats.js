/**
 * THE PROSPECT'S RECORD.
 *
 * Runtime systems may count every shot, hit and casualty while a scene is
 * alive. The campaign does not write on those hot paths. Instead, a scene
 * hands its small final report to `recordCampaignMissionBoundary()` once, at
 * the same durable seam that completes the mission. The completed-id list is
 * a fixed sixteen-item whitelist, not an event log, and makes that fold
 * exact-once across reloads and repeated completion calls.
 *
 * This module deliberately does not import campaign.js. Campaign owns the
 * schema and imports these pure helpers; importing back would make save
 * normalisation depend on a circular module evaluation.
 */

export const CAMPAIGN_STAT_MISSION_IDS = Object.freeze([
  'bada_bing_one',
  'squatchfather',
  'airstrip_smuggling',
  'bada_bing_two',
  'jerky_motel',
  'no_wake',
  'silver_room',
  'silver_pines',
  'bank_heist',
  'silver_case',
  'silent_squatch',
  'mansion_siege',
  'enola_squatch',
  'mansion_return',
  'cartel_palace',
  'initiation',
]);

const MISSION_ID_SET = new Set(CAMPAIGN_STAT_MISSION_IDS);
const MAX_COUNTER = 1_000_000;
const MAX_MONEY = 100_000_000;

const MARKERS = Object.freeze({
  CABIN_EXECUTION_PLAYER: 'choice.countryside_cabin.execution.player',
  CABIN_EXECUTION_GRATIN: 'choice.countryside_cabin.execution.gratin',
  CABIN_COUNTER_STRIKE_DEAD: 'death.countryside_cabin.counter_strike',
  CABIN_ATEAM_DEAD: 'death.countryside_cabin.ateam',
  MARGO_COME_HOME: 'scene.margo_come_home',
  LUXURY_MARGO_COME_HOME: 'scene.luxury.margo_come_home',
});

function integer(value, max = MAX_COUNTER, fallback = 0) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.round(value)))
    : fallback;
}

function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function completedIds(value) {
  const requested = Array.isArray(value) ? new Set(value) : new Set();
  return CAMPAIGN_STAT_MISSION_IDS.filter((id) => requested.has(id));
}

export function initialCampaignStatistics() {
  return {
    missionsCompleted: 0,
    campaignDaysElapsed: 1,
    shotsFired: 0,
    peopleKilled: 0,
    cabinExecutionByProspect: null,
    cabinExecutionCounted: false,
    margoCameHome: null,
    grossTake: 0,
    palaceEvidenceRecovered: 0,
    familyRespect: 0,
    completedMissionIds: [],
  };
}

/** Repair a statistics block without consulting scene state or inventing data. */
export function normalizeCampaignStatistics(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value : {};
  const ids = completedIds(source.completedMissionIds);
  return {
    missionsCompleted: ids.length,
    campaignDaysElapsed: Math.max(1, integer(source.campaignDaysElapsed, 10_000, 1)),
    shotsFired: integer(source.shotsFired),
    peopleKilled: integer(source.peopleKilled),
    cabinExecutionByProspect: optionalBoolean(source.cabinExecutionByProspect),
    cabinExecutionCounted: source.cabinExecutionCounted === true,
    margoCameHome: optionalBoolean(source.margoCameHome),
    grossTake: integer(source.grossTake, MAX_MONEY),
    palaceEvidenceRecovered: integer(source.palaceEvidenceRecovered, 64),
    familyRespect: integer(source.familyRespect, 100),
    completedMissionIds: ids,
  };
}

function durableMissionFacts(state, missionId) {
  const mission = state?.missions?.[missionId] ?? {};
  switch (missionId) {
    /* These are the only firearm counts that old saves can prove from their
     * existing durable summaries. A pre-v24 save did not store missed rounds,
     * so migration records zero for those rather than making one up. */
    case 'no_wake':
      return {
        shotsFired: mission.playerFired === true ? 1 : 0,
        peopleKilled: mission.playerFired === true ? 1 : 0,
      };
    case 'silver_case':
      return {
        peopleKilled: mission.winstonOutcome === 'player_killed' ? 1 : 0,
      };
    case 'silent_squatch':
      return { peopleKilled: integer(mission.scientistsLost, 6) };
    case 'bank_heist':
      return { peopleKilled: integer(mission.civiliansHarmed, 99) };
    case 'cartel_palace':
      return {
        peopleKilled: Number(mission.markEliminated === true)
          + Number(mission.sauceEliminated === true),
      };
    default:
      return {};
  }
}

/**
 * Fold one mission's final counters into the persistent record. Returns true
 * only for the first fold of that mission id.
 */
export function recordCampaignMissionBoundary(state, missionId, report = {}) {
  if (!state || typeof state !== 'object' || !MISSION_ID_SET.has(missionId)) return false;
  const stats = normalizeCampaignStatistics(state.statistics);
  if (stats.completedMissionIds.includes(missionId)) {
    state.statistics = stats;
    return false;
  }

  const durable = durableMissionFacts(state, missionId);
  const shotsFired = Number.isFinite(report.shotsFired)
    ? Math.max(report.shotsFired, durable.shotsFired ?? 0) : durable.shotsFired;
  const peopleKilled = Number.isFinite(report.peopleKilled)
    ? Math.max(report.peopleKilled, durable.peopleKilled ?? 0) : durable.peopleKilled;
  stats.shotsFired = integer(stats.shotsFired + integer(shotsFired));
  stats.peopleKilled = integer(stats.peopleKilled + integer(peopleKilled));
  stats.completedMissionIds.push(missionId);
  stats.completedMissionIds = completedIds(stats.completedMissionIds);
  stats.missionsCompleted = stats.completedMissionIds.length;
  state.statistics = stats;
  return true;
}

/**
 * Keep the bounded summaries in step with the campaign whenever a durable
 * update reaches a mission or scene boundary. This is intentionally called
 * by Campaign.update(), after the scene mutation and before the one save.
 */
export function synchronizeCampaignStatistics(state) {
  if (!state || typeof state !== 'object') return initialCampaignStatistics();
  state.statistics = normalizeCampaignStatistics(state.statistics);

  for (const missionId of CAMPAIGN_STAT_MISSION_IDS) {
    if (state.missions?.[missionId]?.status === 'complete') {
      recordCampaignMissionBoundary(state, missionId);
    }
  }

  const stats = normalizeCampaignStatistics(state.statistics);
  stats.campaignDaysElapsed = Math.max(
    stats.campaignDaysElapsed,
    Number.isSafeInteger(state.story?.day) && state.story.day > 0 ? state.story.day : 1,
  );
  stats.grossTake = Math.max(
    stats.grossTake,
    integer(state.missions?.bank_heist?.grossTake, MAX_MONEY),
  );
  stats.palaceEvidenceRecovered = Math.max(
    stats.palaceEvidenceRecovered,
    Array.isArray(state.missions?.cartel_palace?.evidenceFound)
      ? new Set(state.missions.cartel_palace.evidenceFound).size : 0,
  );
  stats.familyRespect = Math.max(stats.familyRespect, integer(state.story?.familyRespect, 100));

  const spent = new Set(Array.isArray(state.story?.timeEvents) ? state.story.timeEvents : []);
  if (stats.cabinExecutionByProspect === null) {
    if (spent.has(MARKERS.CABIN_EXECUTION_PLAYER)) stats.cabinExecutionByProspect = true;
    else if (spent.has(MARKERS.CABIN_EXECUTION_GRATIN)) stats.cabinExecutionByProspect = false;
  }
  if (!stats.cabinExecutionCounted
    && stats.cabinExecutionByProspect === true
    && spent.has(MARKERS.CABIN_COUNTER_STRIKE_DEAD)
    && spent.has(MARKERS.CABIN_ATEAM_DEAD)) {
    stats.peopleKilled = integer(stats.peopleKilled + 2);
    stats.cabinExecutionCounted = true;
  } else if (!stats.cabinExecutionCounted
    && stats.cabinExecutionByProspect === false
    && spent.has(MARKERS.CABIN_COUNTER_STRIKE_DEAD)
    && spent.has(MARKERS.CABIN_ATEAM_DEAD)) {
    /* The bodies are part of the chapter, but Gratin's two shots are not put
     * on Tony's record. Latch the seam so later normalisation remains stable. */
    stats.cabinExecutionCounted = true;
  }

  if (stats.margoCameHome === null
    && (spent.has(MARKERS.LUXURY_MARGO_COME_HOME)
      || spent.has(MARKERS.MARGO_COME_HOME))) {
    /* The canonical route always brings Margo home now. Silver Room's legacy
     * `cameHome` field became a date-performance verdict, so it is not evidence
     * that this later physical beat did or did not happen. */
    stats.margoCameHome = true;
  }

  state.statistics = normalizeCampaignStatistics(stats);
  return state.statistics;
}

/** Build schema-v24 statistics from any older or partially populated save. */
export function migrateCampaignStatistics(state) {
  const candidate = {
    ...(state ?? {}),
    statistics: normalizeCampaignStatistics(state?.statistics),
  };
  return synchronizeCampaignStatistics(candidate);
}

function yesNoUnknown(value, yes, no) {
  if (value === true) return yes;
  if (value === false) return no;
  return 'Not recorded';
}

function money(value) {
  return `$${integer(value, MAX_MONEY).toLocaleString('en-US')}`;
}

/** Presentation data built from the stored block only; no scene-state scrape. */
export function buildProspectsRecord(statistics) {
  const stats = normalizeCampaignStatistics(statistics);
  return Object.freeze({
    title: "THE PROSPECT'S RECORD",
    rows: Object.freeze([
      Object.freeze({ label: 'Missions completed', value: `${stats.missionsCompleted} / ${CAMPAIGN_STAT_MISSION_IDS.length}` }),
      Object.freeze({ label: 'Campaign days elapsed', value: String(stats.campaignDaysElapsed) }),
      Object.freeze({ label: 'Shots fired', value: stats.shotsFired.toLocaleString('en-US') }),
      Object.freeze({ label: 'Confirmed kills', value: stats.peopleKilled.toLocaleString('en-US') }),
      Object.freeze({
        label: 'Cabin execution',
        value: yesNoUnknown(stats.cabinExecutionByProspect, 'Handled by the Prospect', 'Left to Gratin'),
      }),
      Object.freeze({
        label: 'Margo came home',
        value: yesNoUnknown(stats.margoCameHome, 'Yes', 'No'),
      }),
      Object.freeze({ label: 'THE TAKE · gross', value: money(stats.grossTake) }),
      Object.freeze({ label: 'Palace evidence recovered', value: String(stats.palaceEvidenceRecovered) }),
      Object.freeze({ label: 'Family respect', value: `${stats.familyRespect} / 100` }),
    ]),
  });
}

export function prospectRecordCreditEntries(statistics) {
  const record = buildProspectsRecord(statistics);
  return Object.freeze([
    Object.freeze({ kind: 'section', text: record.title }),
    ...record.rows.map(({ label, value }) => Object.freeze({
      kind: 'credit', role: label, name: value,
    })),
  ]);
}
