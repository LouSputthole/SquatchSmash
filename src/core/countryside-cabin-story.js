/**
 * The countryside cabin is a later-game home base, not a mission.
 *
 * Lou sends Tony here after THE TAKE. The apartment remains the campaign's
 * original hub; this scene borrows its domestic verbs while the final arc
 * waits off-screen. Exploration is optional and durable. Every landmark uses
 * Campaign's exact-once time ledger, so a reload cannot erase a walk or let a
 * repeated interaction farm hours.
 */
import { MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS } from './campaign.js';

export const COUNTRYSIDE_CABIN_LANDMARKS = Object.freeze([
  Object.freeze({
    id: 'creek',
    label: 'Follow the creek crossing',
    shortLabel: 'Creek crossing',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_CREEK,
    line: 'Cold water, old stones, and nobody close enough to ask what he is doing here.',
  }),
  Object.freeze({
    id: 'overlook',
    label: 'Climb to the ridge overlook',
    shortLabel: 'Ridge overlook',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_OVERLOOK,
    line: 'The road disappears under the trees. From up here, so does the cabin.',
  }),
  Object.freeze({
    id: 'shed',
    label: 'Check the old forestry shed',
    shortLabel: 'Forestry shed',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_SHED,
    line: 'Axes, fuel tins, a workbench, and enough dust to prove nobody beat him here.',
  }),
  Object.freeze({
    id: 'firepit',
    label: 'Inspect the fire ring',
    shortLabel: 'Fire ring',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_FIREPIT,
    line: 'The ash is old. Lou chose a hideout, not a place somebody was still using.',
  }),
]);

const LANDMARK_BY_ID = new Map(COUNTRYSIDE_CABIN_LANDMARKS.map((entry) => [entry.id, entry]));

export class CountrysideCabinStory {
  constructor({ campaign } = {}) {
    if (!campaign || typeof campaign.advanceTime !== 'function') {
      throw new TypeError('Countryside cabin story requires a campaign');
    }
    this.campaign = campaign;
  }

  /** Which optional walks already happened, in authored display order. */
  explored() {
    const events = new Set(this.campaign.state.story.timeEvents);
    return COUNTRYSIDE_CABIN_LANDMARKS.filter((entry) => events.has(entry.eventId));
  }

  visit(id) {
    const landmark = LANDMARK_BY_ID.get(id);
    if (!landmark) return { ok: false, reason: 'unknown_landmark' };
    const result = this.campaign.advanceTime(landmark.eventId);
    return {
      ok: true,
      firstVisit: result.applied,
      landmark,
      day: result.day,
      timeMinutes: result.timeMinutes,
    };
  }

  /**
   * One authored full rest while he is laying low. Further bed use still works
   * as a posture interaction, but it cannot advance the same eight hours twice.
   */
  rest() {
    const result = this.campaign.advanceTime(TIME_EVENT_IDS.CABIN_REST, (state) => {
      state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'wake' };
    });
    return {
      ok: result.applied,
      reason: result.applied ? null : 'already_rested',
      day: result.day,
      timeMinutes: result.timeMinutes,
    };
  }

  rested() {
    return this.campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.CABIN_REST);
  }

  /** The parked car is the cabin's equivalent of the apartment front door. */
  tryLeave() {
    const silverCase = this.campaign.state.missions[MISSION_IDS.SILVER_CASE];
    if (silverCase?.status === 'available' || silverCase?.status === 'in_progress') {
      if (!this.rested()) {
        return {
          kind: 'stay',
          id: 'cabin_rest_first',
          line: 'Lou said disappear for a while. One night, at least.',
        };
      }
      return { kind: 'go', destination: SCENE_IDS.SILVER_CASE };
    }
    if (silverCase?.status === 'complete') {
      return {
        kind: 'stay',
        id: 'cabin_stay_over',
        line: 'The next thing already started. This place did its job.',
      };
    }
    return {
      kind: 'stay',
      id: 'cabin_wait',
      line: 'Lou said stay put. The road can wait until the phone says otherwise.',
    };
  }

  objectives() {
    const explored = new Set(this.explored().map((entry) => entry.id));
    const out = [
      {
        id: 'lay-low',
        label: 'Lay low at the countryside cabin',
        done: true,
        required: true,
      },
      ...COUNTRYSIDE_CABIN_LANDMARKS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        done: explored.has(entry.id),
        required: false,
      })),
      {
        id: TIME_EVENT_IDS.CABIN_REST,
        label: 'Lay low until Lou calls tomorrow',
        done: this.rested(),
        required: true,
      },
    ];
    const door = this.tryLeave();
    out.push({
      id: `depart.${door.destination ?? door.id}`,
      label: door.kind === 'go' ? 'Take the car when Lou’s next job is ready' : 'Wait for Lou',
      done: false,
      required: true,
    });
    return out;
  }
}

export function createCountrysideCabinStory(options) {
  return new CountrysideCabinStory(options);
}
