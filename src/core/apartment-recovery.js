import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
} from './campaign.js';
import {
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
} from './apartment-story.js';

const PREPARATION_IDS = new Set(HEIST_PREPARATION_ITEMS.map(({ id }) => id));
const CLEANUP_IDS = new Set(HEIST_CLEANUP_ITEMS.map(({ id }) => id));
const SLEEP_GATES = new Set(['sleep', 'sleep_before_big_night']);
const MAX_RECOVERY_STEPS = 32;

/**
 * A hub visit is not a single forever-scene. Retry eligibility belongs to the
 * durable departure/return beat the player is stuck on, so retries before the
 * first Bing cannot pre-unlock a skip after the motel three chapters later.
 */
export function apartmentRecoveryBeatId(state) {
  const chapter = state?.story?.chapter ?? 'unknown';
  const missions = state?.missions ?? {};
  if (chapter === 'day_one') {
    if (missions[MISSION_IDS.BADA_BING_ONE]?.status !== 'complete') {
      return `${SCENE_IDS.APARTMENT}:day_one:before_bing`;
    }
    if (missions[MISSION_IDS.SQUATCHFATHER]?.status !== 'complete') {
      return `${SCENE_IDS.APARTMENT}:day_one:before_squatchfather`;
    }
    return `${SCENE_IDS.APARTMENT}:day_one:after_squatchfather`;
  }
  if (chapter === 'day_two') {
    if (missions[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status !== 'complete') {
      return `${SCENE_IDS.APARTMENT}:day_two:before_airstrip`;
    }
    if (missions[MISSION_IDS.BADA_BING_TWO]?.status !== 'complete') {
      return `${SCENE_IDS.APARTMENT}:day_two:before_hotdog`;
    }
    if (missions[MISSION_IDS.JERKY_MOTEL]?.status !== 'complete') {
      return `${SCENE_IDS.APARTMENT}:day_two:before_motel`;
    }
    return `${SCENE_IDS.APARTMENT}:day_two:after_motel`;
  }
  if (chapter === 'date') {
    return missions[MISSION_IDS.SILVER_ROOM]?.status === 'complete'
      ? `${SCENE_IDS.APARTMENT}:date:after_silver`
      : `${SCENE_IDS.APARTMENT}:date:before_silver`;
  }
  if (chapter === 'golf_morning') {
    return `${SCENE_IDS.APARTMENT}:golf_morning:before_golf`;
  }
  if (chapter === 'heist_day') {
    return `${SCENE_IDS.APARTMENT}:heist_day:before_heist`;
  }
  if (chapter === 'post_heist') {
    return `${SCENE_IDS.APARTMENT}:post_heist:return`;
  }
  if (chapter === 'no_wake') {
    return `${SCENE_IDS.APARTMENT}:no_wake:departure`;
  }
  if (chapter === 'big_night') {
    return `${SCENE_IDS.APARTMENT}:big_night:departure`;
  }
  return `${SCENE_IDS.APARTMENT}:${chapter}:recovery`;
}

/**
 * Find the next final-arc page when an old save lands back in the apartment.
 * The current final arc normally transitions page-to-page, but older saves can
 * still carry the former Apartment -> Initiation route. Recovery must send
 * those saves into the first unfinished canonical scene, never jump straight
 * over the new arc.
 */
function finalArcDestination(state) {
  const missions = state.missions;
  const silverCase = missions[MISSION_IDS.SILVER_CASE];
  if (silverCase?.status !== 'complete') return null;

  const silent = missions[MISSION_IDS.SILENT_SQUATCH];
  if (['available', 'in_progress'].includes(silent?.status)) return SCENE_IDS.MANSION;
  if (silent?.status !== 'complete') return null;
  if (silent.sleptAtMansion !== true) return SCENE_IDS.MANSION;

  const siege = missions[MISSION_IDS.MANSION_SIEGE];
  if (['available', 'in_progress'].includes(siege?.status)) return SCENE_IDS.MANSION_SIEGE;
  if (siege?.status !== 'complete') return null;

  const enola = missions[MISSION_IDS.ENOLA_SQUATCH];
  if (['available', 'in_progress'].includes(enola?.status)) return SCENE_IDS.ENOLA_SQUATCH;
  if (enola?.status !== 'complete') return null;

  const mansionReturn = missions[MISSION_IDS.MANSION_RETURN];
  if (['available', 'in_progress'].includes(mansionReturn?.status)) return SCENE_IDS.MANSION_RETURN;
  if (mansionReturn?.status !== 'complete') return null;

  const cartel = missions[MISSION_IDS.CARTEL_PALACE];
  if (['available', 'in_progress'].includes(cartel?.status)) return SCENE_IDS.CARTEL_PALACE;
  if (cartel?.status !== 'complete') return null;

  return ['available', 'in_progress'].includes(missions[MISSION_IDS.INITIATION]?.status)
    ? SCENE_IDS.INITIATION
    : null;
}

/**
 * Scene-specific Apartment Skip adapter.
 *
 * The apartment is a campaign router rather than one mission, so "complete
 * scene" means resolving only the blocking return/morning beats until the next
 * playable mission is ready. Required calls, chores, sleeps, and heist kit are
 * committed through ApartmentStory before navigation. Optional activities are
 * deliberately untouched.
 */
export function createApartmentRecoverySkipAdapter({
  campaign,
  story,
  getActivities,
  completeActivity,
  settleBlockingBeat = () => true,
  navigate,
} = {}) {
  if (!campaign || !story
    || typeof getActivities !== 'function'
    || typeof completeActivity !== 'function'
    || typeof settleBlockingBeat !== 'function'
    || typeof navigate !== 'function') {
    throw new TypeError('Apartment recovery requires campaign, story, activity, and navigation adapters');
  }

  function finish(destination) {
    if (!destination || navigate(destination) === false) {
      return { ok: false, reason: 'apartment_recovery_navigation_refused' };
    }
    return { ok: true, from: SCENE_IDS.APARTMENT, to: destination };
  }

  return function completeApartmentBeatAndSkip() {
    if (campaign.state.scene.id !== SCENE_IDS.APARTMENT) {
      return { ok: false, reason: 'apartment_recovery_wrong_scene' };
    }
    if (settleBlockingBeat() === false) {
      return { ok: false, reason: 'apartment_recovery_blocked' };
    }

    for (let step = 0; step < MAX_RECOVERY_STEPS; step++) {
      const finalDestination = finalArcDestination(campaign.state);
      if (finalDestination) return finish(finalDestination);

      const decision = story.tryLeave(getActivities());
      if (decision?.kind === 'go') return finish(decision.destination);

      if (decision?.kind === 'call') {
        const call = story.pendingCall();
        if (!call || call.eventId !== decision.id || story.callAnswered(call) !== true) break;
        continue;
      }

      if (decision?.kind === 'item' && decision.id === ITEM_IDS.LOU_PACKAGE) {
        campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
        continue;
      }

      if (decision?.kind === 'activity') {
        let completed = false;
        if (PREPARATION_IDS.has(decision.id)) {
          completed = story.collectHeistPreparation(decision.id) === true;
        } else if (CLEANUP_IDS.has(decision.id)) {
          completed = story.completeHeistCleanup(decision.id) === true;
        } else {
          completed = completeActivity(decision.id) === true;
        }
        if (!completed) break;
        continue;
      }

      if (decision?.kind === 'stay' && SLEEP_GATES.has(decision.id)) {
        if (story.sleep()?.ok !== true) break;
        continue;
      }

      // One old transition wrote a completed round without advancing its
      // chapter. Repair that durable seam, then let the normal heist-day call
      // and packing gates run on the next loop.
      if (decision?.kind === 'stay'
        && decision.id === 'golf_return_pending'
        && campaign.state.missions[MISSION_IDS.SILVER_PINES].status === 'complete') {
        campaign.update((state) => {
          state.story.chapter = 'heist_day';
          state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
        });
        continue;
      }

      break;
    }

    return { ok: false, reason: 'apartment_recovery_blocked' };
  };
}
