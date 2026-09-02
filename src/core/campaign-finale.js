import { MISSION_IDS, TIME_EVENT_IDS } from './campaign.js';
import { buildProspectsRecord } from './campaign-stats.js';
import { encodeRunCode } from './run-code.js';

export const CAMPAIGN_FINALE_STATUS = Object.freeze({
  LOCKED: 'locked',
  READY: 'ready',
  FREEPLAY: 'freeplay',
});

export const CAMPAIGN_CREDITS = Object.freeze([
  Object.freeze({ role: 'Created by', name: 'LouSputthole' }),
  Object.freeze({ role: 'Built with', name: 'Three.js' }),
  Object.freeze({ role: 'Starring', name: 'Tony and the Family' }),
  Object.freeze({ role: 'From the Bing to the Palace', name: 'Thanks for playing' }),
]);

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
  const record = buildProspectsRecord(state.statistics);
  /* The run code is the record above, packed: nineteen characters that
   * `node tools/decode-run-code.mjs` turns back into this same table. Owner,
   * 2026-09-02: everyone gets a code, and he plugs it in to see their stats.
   * See `src/core/run-code.js` for the layout. */
  const runCode = encodeRunCode(state.statistics);
  const highlights = [
    'One campaign. One line. No mission grades.',
    'The figures above were banked at durable scene and mission boundaries.',
    `Your run code is ${runCode}. Send it to Lou; the Family reads the whole record off it.`,
  ];

  return Object.freeze({
    title: record.title,
    subtitle: `${campaignClock(state.story)} · The campaign is complete.`,
    stats: Object.freeze([
      ...record.rows,
      Object.freeze({ label: 'Run code', value: runCode, code: true }),
    ]),
    runCode,
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
