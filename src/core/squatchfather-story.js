import {
  ITEM_IDS,
  MISSION_IDS,
} from './campaign.js';

class SquatchfatherStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.SQUATCHFATHER];
    if (mission.status === 'in_progress' && mission.weaponStaged) {
      return { ok: true, resumed: true };
    }
    if (mission.status === 'complete') {
      return { ok: false, reason: 'already_complete' };
    }
    if (state.missions[MISSION_IDS.BADA_BING_ONE].status !== 'complete') {
      return { ok: false, reason: 'bada_bing_incomplete' };
    }
    if (!this.campaign.hasItem(ITEM_IDS.LOU_PACKAGE)) {
      return { ok: false, reason: 'missing_package' };
    }
    if (mission.status !== 'available') {
      return { ok: false, reason: 'mission_locked' };
    }

    this.campaign.update((next) => {
      next.inventory.carried = next.inventory.carried
        .filter((itemId) => itemId !== ITEM_IDS.LOU_PACKAGE);
      next.inventory.concealed = next.inventory.concealed
        .filter((itemId) => itemId !== ITEM_IDS.LOU_PACKAGE);
      const active = next.missions[MISSION_IDS.SQUATCHFATHER];
      active.status = 'in_progress';
      active.weaponStaged = true;
      active.weaponDropped = false;
    });
    return { ok: true, resumed: false };
  }

  complete() {
    const mission = this.campaign.state.missions[MISSION_IDS.SQUATCHFATHER];
    if (mission.status !== 'in_progress' || !mission.weaponStaged) return false;
    this.campaign.update((state) => {
      const completed = state.missions[MISSION_IDS.SQUATCHFATHER];
      completed.status = 'complete';
      completed.weaponDropped = true;
    });
    return true;
  }
}

export function createSquatchfatherStory(options) {
  return new SquatchfatherStory(options);
}
