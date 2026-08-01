import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  navigateCampaign,
} from './campaign.js';

export const BADA_BING_TWO_CLEANUP_TASKS = Object.freeze([
  'bathrooms',
  'cleaning_kit',
  'missing_evidence',
  'final_sweep',
]);

class BadaBingTwoStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.BADA_BING_TWO];
    if (mission.status === 'in_progress') {
      return { ok: true, resumed: true, checkpoint: mission.checkpoint ?? 'party' };
    }
    if (mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status !== 'complete') {
      return { ok: false, reason: 'airstrip_incomplete' };
    }
    if (state.events[EVENT_IDS.LOU_SECOND_CALL].status !== 'answered') {
      return { ok: false, reason: 'lou_call_incomplete' };
    }
    if (mission.status !== 'available') return { ok: false, reason: 'mission_locked' };

    this.campaign.update((next) => {
      const started = next.missions[MISSION_IDS.BADA_BING_TWO];
      started.status = 'in_progress';
      started.checkpoint = 'party';
    });
    return { ok: true, resumed: false, checkpoint: 'party' };
  }

  recordAttack({ gunKicked = false } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (mission.status !== 'in_progress' || gunKicked !== true) return false;
    this.campaign.update((state) => {
      const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
      incident.checkpoint = 'attack';
      incident.gunKicked = true;
    });
    return true;
  }

  recordCleanup(taskId) {
    if (!BADA_BING_TWO_CLEANUP_TASKS.includes(taskId)) return false;
    const mission = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (mission.status !== 'in_progress' || !mission.gunKicked) return false;
    if (mission.cleanupTasks.includes(taskId)) return true;
    this.campaign.update((state) => {
      const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
      incident.checkpoint = 'cleanup';
      incident.cleanupTasks.push(taskId);
    });
    return true;
  }

  completeClub({ assignment, bodyWrapped = false, bodyLoaded = false } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    const cleaned = BADA_BING_TWO_CLEANUP_TASKS
      .every((task) => mission.cleanupTasks.includes(task));
    if (mission.status !== 'in_progress'
      || !mission.gunKicked
      || !cleaned
      || bodyWrapped !== true
      || bodyLoaded !== true
      || typeof assignment !== 'string'
      || !assignment.trim()) return false;
    const result = this.campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD, (state) => {
      const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
      incident.checkpoint = 'body_loaded';
      incident.assignment = assignment;
      incident.bodyWrapped = true;
      incident.bodyLoaded = true;
    });
    return result.applied;
  }

  /** Kept as a narrow compatibility surface for callers updated in stages. */
  complete(result = {}) {
    return this.completeClub(result);
  }

  continueAfterCompletion({ location = globalThis.location } = {}) {
    const state = this.campaign.state;
    if (state.missions[MISSION_IDS.BADA_BING_TWO].status !== 'complete') return null;
    if (state.scene.id !== SCENE_IDS.BADA_BING_TWO) {
      this.campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
    }
    return navigateCampaign(this.campaign, SCENE_IDS.SQUATCH_GRAVEYARD, {
      spawn: 'headlights',
      location,
    });
  }
}

export function createBadaBingTwoStory(options) {
  return new BadaBingTwoStory(options);
}
