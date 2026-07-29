import {
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
} from './campaign.js';

const FIRST_RING_DELAY = 6;
const RETRY_DELAY = 30;
const DEPARTURE_REQUIREMENTS = Object.freeze([
  {
    id: 'eaten',
    line: 'I have not eaten. Lou can hear that over the phone somehow.',
    hint: 'There are eggs in the fridge and a pan on the hob.',
  },
  {
    id: 'showered',
    line: 'Not like this. Shower first.',
    hint: 'The bathroom is through the north door.',
  },
  {
    id: 'pooped',
    line: 'Absolutely not. Bathroom first.',
    hint: 'You definitely know where it is.',
  },
  {
    id: 'changedClothes',
    line: 'I am still wearing what I slept in.',
    hint: 'There is a drawer in the nightstand.',
  },
]);

export const DAY_ONE_LOU_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_FIRST_CALL,
  characterId: CHARACTER_IDS.LOU,
  from: 'Lou',
  vo: 'call.lou.bada_bing',
  lines: Object.freeze([
    'Kid. You awake?',
    'Meet me at the Bada Bing. Back office.',
    'I have a package for you, and I need it handled tonight.',
    'Eat, shower, and put on something clean before you come down. I am serious.',
  ]),
});

class ApartmentStory {
  constructor({ campaign, ring }) {
    this.campaign = campaign;
    this.ring = ring;
    this.started = false;
    this.elapsed = 0;
    this.nextRingAt = FIRST_RING_DELAY;
  }

  beginMorning() {
    this.started = true;
  }

  update(dt) {
    if (!this.started || this.#callAnswered()) return;
    this.elapsed += Math.max(0, dt);
    if (this.elapsed < this.nextRingAt) return;
    const rang = this.ring?.(DAY_ONE_LOU_CALL) === true;
    this.nextRingAt = this.elapsed + (rang ? RETRY_DELAY : 1);
  }

  callAnswered(definition) {
    if (definition?.eventId !== EVENT_IDS.LOU_FIRST_CALL || this.#callAnswered()) return false;
    this.campaign.update((state) => {
      state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
      state.missions[MISSION_IDS.BADA_BING_ONE].status = 'available';
    });
    return true;
  }

  tryLeave(activities = {}) {
    if (!this.#callAnswered()) {
      return {
        kind: 'call',
        id: EVENT_IDS.LOU_FIRST_CALL,
        line: 'Lou said he would call. I should answer before I go anywhere.',
      };
    }
    const missions = this.campaign.state.missions;
    if (missions[MISSION_IDS.BADA_BING_ONE].status === 'complete') {
      if (missions[MISSION_IDS.SQUATCHFATHER].status === 'complete') {
        return {
          kind: 'stay',
          id: 'sleep',
          line: 'That is enough going out for one night.',
        };
      }
      if (missions[MISSION_IDS.SQUATCHFATHER].status === 'in_progress'
        && missions[MISSION_IDS.SQUATCHFATHER].weaponStaged) {
        return {
          kind: 'go',
          destination: SCENE_IDS.SQUATCHFATHER,
        };
      }
      if (!this.campaign.hasItem(ITEM_IDS.LOU_PACKAGE)) {
        return {
          kind: 'item',
          id: ITEM_IDS.LOU_PACKAGE,
          line: 'I am not going anywhere until I find Lou’s package.',
        };
      }
      return {
        kind: 'go',
        destination: SCENE_IDS.SQUATCHFATHER,
      };
    }
    const missing = DEPARTURE_REQUIREMENTS.find(({ id }) => !activities[id]);
    if (missing) return { kind: 'activity', ...missing };
    return {
      kind: 'go',
      destination: SCENE_IDS.BADA_BING_ONE,
    };
  }

  #callAnswered() {
    return this.campaign.state.events[EVENT_IDS.LOU_FIRST_CALL].status === 'answered';
  }
}

export function createApartmentStory(options) {
  return new ApartmentStory(options);
}
