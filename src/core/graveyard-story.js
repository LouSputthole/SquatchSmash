import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  navigateCampaign,
} from './campaign.js';

const TRAITOR_GRAVES = Object.freeze(['brawny', 'whiplash']);

class GraveyardStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const incident = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (incident.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (incident.status !== 'in_progress' || !incident.bodyLoaded) {
      return { ok: false, reason: 'body_not_loaded' };
    }
    if (incident.checkpoint === 'graveyard') return { ok: true, resumed: true };
    if (incident.checkpoint !== 'body_loaded') {
      return { ok: false, reason: 'club_incomplete' };
    }
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.BADA_BING_TWO].checkpoint = 'graveyard';
    });
    return { ok: true, resumed: false };
  }

  noteEcho() {
    const incident = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (incident.status !== 'in_progress' || incident.checkpoint !== 'graveyard') return false;
    if (incident.echoHeard) return true;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.BADA_BING_TWO].echoHeard = true;
    });
    return true;
  }

  recordUrination(graveId) {
    if (!TRAITOR_GRAVES.includes(graveId)) return false;
    const incident = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (incident.status !== 'in_progress' || incident.checkpoint !== 'graveyard') return false;
    if (incident.urinatedOn.includes(graveId)) return true;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.BADA_BING_TWO].urinatedOn.push(graveId);
    });
    return true;
  }

  complete({ bodyBuried = false } = {}) {
    const incident = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (incident.status !== 'in_progress'
      || incident.checkpoint !== 'graveyard'
      || bodyBuried !== true) return false;
    const result = this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO, (state) => {
      const completed = state.missions[MISSION_IDS.BADA_BING_TWO];
      completed.status = 'complete';
      completed.checkpoint = 'buried';
      completed.burialComplete = true;
      state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
    });
    return result.applied;
  }

  continueAfterCompletion({ location = globalThis.location } = {}) {
    const state = this.campaign.state;
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    if (incident.status !== 'complete' || !incident.burialComplete) return null;
    if (state.scene.id !== SCENE_IDS.SQUATCH_GRAVEYARD) {
      this.campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
    }
    this.campaign.advanceTime(TIME_EVENT_IDS.DEPART_JERKY_MOTEL);
    return navigateCampaign(this.campaign, SCENE_IDS.JERKY_MOTEL, {
      spawn: 'passenger_seat',
      location,
    });
  }
}

export function createGraveyardStory(options) {
  return new GraveyardStory(options);
}
