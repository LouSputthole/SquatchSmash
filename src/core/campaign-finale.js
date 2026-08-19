import { MISSION_IDS, TIME_EVENT_IDS } from './campaign.js';

export const CAMPAIGN_FINALE_STATUS = Object.freeze({
  LOCKED: 'locked',
  READY: 'ready',
  FREEPLAY: 'freeplay',
});

const CAREER_MISSIONS = Object.freeze([
  MISSION_IDS.BADA_BING_ONE,
  MISSION_IDS.SQUATCHFATHER,
  MISSION_IDS.AIRSTRIP_SMUGGLING,
  MISSION_IDS.BADA_BING_TWO,
  MISSION_IDS.JERKY_MOTEL,
  MISSION_IDS.NO_WAKE,
  MISSION_IDS.SILVER_ROOM,
  MISSION_IDS.SILVER_PINES,
  MISSION_IDS.BANK_HEIST,
  MISSION_IDS.SILVER_CASE,
  MISSION_IDS.SILENT_SQUATCH,
  MISSION_IDS.MANSION_SIEGE,
  MISSION_IDS.ENOLA_SQUATCH,
  MISSION_IDS.MANSION_RETURN,
  MISSION_IDS.CARTEL_PALACE,
  MISSION_IDS.INITIATION,
]);

export const CAMPAIGN_CREDITS = Object.freeze([
  Object.freeze({ role: 'Created by', name: 'LouSputthole' }),
  Object.freeze({ role: 'Built with', name: 'Three.js' }),
  Object.freeze({ role: 'Starring', name: 'Tony and the Family' }),
  Object.freeze({ role: 'From the Bing to the Palace', name: 'Thanks for playing' }),
]);

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function money(value) {
  const amount = finiteInteger(value);
  return amount > 0 ? `$${amount.toLocaleString('en-US')}` : 'Completed';
}

function golfCard(mission) {
  const holes = finiteInteger(mission?.holesPlayed);
  const strokes = finiteInteger(mission?.strokes);
  if (holes === 0 || strokes === 0) return 'Round complete';
  const toPar = Number.isFinite(mission?.toPar) ? Math.round(mission.toPar) : 0;
  const relative = toPar === 0 ? 'E' : (toPar > 0 ? `+${toPar}` : String(toPar));
  return `${strokes} strokes · ${relative}`;
}

function campaignClock(story) {
  const day = Number.isSafeInteger(story?.day) && story.day > 0 ? story.day : 1;
  const minutes = Number.isFinite(story?.timeMinutes)
    ? Math.max(0, Math.round(story.timeMinutes)) : 0;
  const hour24 = Math.floor((minutes % (24 * 60)) / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `Day ${day} · ${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** The frozen Initiation remains the authority for earning the ending. */
export function isCampaignFinaleEligible(state) {
  return state?.missions?.[MISSION_IDS.INITIATION]?.status === 'complete'
    && state?.story?.timeEvents?.includes(TIME_EVENT_IDS.COMPLETE_INITIATION) === true;
}

export function shouldPresentCampaignFinale(state) {
  return isCampaignFinaleEligible(state)
    && state?.finale?.status !== CAMPAIGN_FINALE_STATUS.FREEPLAY;
}

/**
 * Convert durable campaign facts into the one post-campaign card. No scene
 * guesses and no session counters: every line survives a reload.
 */
export function buildCampaignCareerRecap(state) {
  if (!isCampaignFinaleEligible(state)) return null;

  const missionsComplete = CAREER_MISSIONS.reduce(
    (total, id) => total + (state.missions?.[id]?.status === 'complete' ? 1 : 0),
    0,
  );
  const heist = state.missions?.[MISSION_IDS.BANK_HEIST] ?? {};
  const golf = state.missions?.[MISSION_IDS.SILVER_PINES] ?? {};
  const enola = state.missions?.[MISSION_IDS.ENOLA_SQUATCH] ?? {};
  const palace = state.missions?.[MISSION_IDS.CARTEL_PALACE] ?? {};

  const highlights = [];
  if (heist.crewSurvived === true) highlights.push('Every member of THE TAKE came home.');
  if (golf.ace === true) highlights.push('An ace at Silver Pines.');
  if (state.missions?.[MISSION_IDS.SILVER_CASE]?.caseRecovered === true) {
    highlights.push('The Silver Case was recovered.');
  }
  if (state.missions?.[MISSION_IDS.SILENT_SQUATCH]?.trophyAwarded === true) {
    highlights.push('PROJECT SILENT SQUATCH left a trophy in the flat.');
  }
  if (palace.evidenceFound?.length > 0) {
    highlights.push(`${palace.evidenceFound.length} Palace evidence item${palace.evidenceFound.length === 1 ? '' : 's'} recovered.`);
  }

  return Object.freeze({
    title: 'Made.',
    subtitle: `${campaignClock(state.story)} · The campaign is complete.`,
    stats: Object.freeze([
      Object.freeze({ label: 'Jobs complete', value: `${missionsComplete} / ${CAREER_MISSIONS.length}` }),
      Object.freeze({ label: 'Family respect', value: `${finiteInteger(state.story?.familyRespect)} / 100` }),
      Object.freeze({ label: 'THE TAKE', value: money(heist.prospectShare) }),
      Object.freeze({ label: 'Silver Pines', value: golfCard(golf) }),
      Object.freeze({ label: 'Enola Squatch', value: enola.rank || 'Returned home' }),
      Object.freeze({ label: 'Cartel Palace', value: palace.outcome || 'Complete' }),
    ]),
    highlights: Object.freeze(highlights.slice(0, 4)),
    credits: CAMPAIGN_CREDITS,
  });
}

/** Persist the credits handoff before the Apartment releases player input. */
export function enterCampaignFreeplay(campaign) {
  if (!campaign || typeof campaign.updateRequired !== 'function') {
    throw new TypeError('Campaign finale requires a durable Campaign');
  }
  const before = campaign.state;
  if (!isCampaignFinaleEligible(before)) {
    return Object.freeze({ applied: false, reason: 'not_complete', state: before });
  }
  if (before.finale?.status === CAMPAIGN_FINALE_STATUS.FREEPLAY) {
    return Object.freeze({ applied: false, reason: 'already_freeplay', state: before });
  }
  const state = campaign.updateRequired((candidate) => {
    candidate.finale.status = CAMPAIGN_FINALE_STATUS.FREEPLAY;
    candidate.finale.freeplayUnlocked = true;
    candidate.finale.creditsViewed = true;
    candidate.finale.completedAt ??= {
      day: candidate.story.day,
      timeMinutes: candidate.story.timeMinutes,
    };
  });
  return Object.freeze({ applied: true, reason: 'entered_freeplay', state });
}

