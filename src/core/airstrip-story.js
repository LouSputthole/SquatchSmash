import {
  EVENT_IDS,
  MISSION_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

const CHECKPOINTS = Object.freeze([
  'airstrip',
  'remote_strip',
  'returning',
  'landed_home',
]);

class AirstripStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status === 'in_progress') {
      return {
        ok: true,
        resumed: true,
        checkpoint: mission.checkpoint ?? 'airstrip',
      };
    }
    if (mission.status === 'complete') {
      return { ok: false, reason: 'already_complete' };
    }
    if (state.missions[MISSION_IDS.SQUATCHFATHER].status !== 'complete') {
      return { ok: false, reason: 'squatchfather_incomplete' };
    }
    if (state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status !== 'answered') {
      return { ok: false, reason: 'booski_call_incomplete' };
    }
    if (mission.status !== 'available') {
      return { ok: false, reason: 'mission_locked' };
    }

    this.campaign.update((next) => {
      const active = next.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
      active.status = 'in_progress';
      active.checkpoint = 'airstrip';
      active.cargoLoaded = false;
      active.detected = false;
      active.landingQuality = null;
    });
    return { ok: true, resumed: false, checkpoint: 'airstrip' };
  }

  checkpoint(name) {
    if (!CHECKPOINTS.includes(name)) return false;
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress') return false;
    if ((name === 'returning' || name === 'landed_home') && !mission.cargoLoaded) return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].checkpoint = name;
    });
    return true;
  }

  loadCargo() {
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress' || mission.checkpoint !== 'remote_strip') return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].cargoLoaded = true;
    });
    return true;
  }

  markDetected() {
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress') return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].detected = true;
    });
    return true;
  }

  complete({ landingQuality } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress'
      || mission.checkpoint !== 'landed_home'
      || !mission.cargoLoaded) return false;
    this.campaign.update((state) => {
      const completed = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
      completed.status = 'complete';
      completed.landingQuality = typeof landingQuality === 'string'
        ? landingQuality : 'unknown';
    });
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_AIRSTRIP);
    return true;
  }
}

export function createAirstripStory(options) {
  return new AirstripStory(options);
}
