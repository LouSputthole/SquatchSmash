import {
  AIRSTRIP_UNLOCKS,
  EVENT_IDS,
  LANDING_QUALITIES,
  MISSION_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

const CHECKPOINTS = Object.freeze([
  'airstrip',
  'remote_strip',
  'returning',
  'landed_home',
]);

const PREVIEW_FLIGHT_CHECKPOINTS = Object.freeze([
  'takeoff',
  'approach',
  'departure',
  'return',
  'landing',
]);

/* The two vocabularies this file writes into the save live in campaign.js,
 * beside the record they belong to and the sanitiser that has to police them
 * on the way back in. Re-exported here because this is the module a scene
 * talks to. */
export { LANDING_QUALITIES, AIRSTRIP_UNLOCKS };

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

  /**
   * Prepare page-local preview state for a shareable flight link.  The actual
   * aircraft pose still belongs to MissionController; this only makes a later
   * direct start coherent if the player flies it through to completion.
   *
   * It is intentionally not used for an ordinary saved campaign.  Main calls
   * it only after the bounded `?preview=1&checkpoint=` URL parser accepts a
   * value, so no public link can rewrite a player's real save.
   */
  primePreviewFlightCheckpoint(checkpoint) {
    if (!PREVIEW_FLIGHT_CHECKPOINTS.includes(checkpoint)) return false;
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress') return false;
    if (checkpoint === 'takeoff') return true;
    if (!this.checkpoint('remote_strip')) return false;
    if (checkpoint === 'approach') return true;
    if (!this.loadCargo()) return false;
    if (!this.checkpoint('returning')) return false;
    if (checkpoint === 'departure') return true;
    return this.checkpoint('landed_home');
  }

  markDetected() {
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress') return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].detected = true;
    });
    return true;
  }

  /**
   * Close the mission out, and record what was actually earned.
   *
   * ## The seam this fixes
   *
   * `landingQuality` used to be handed the Beef Run's RANK — one of "Gas
   * Station Amateur", "Cargo Curious", "Certified Meat Aviator", "Airborne
   * Butcher", "Silverback Smuggler". The only reader in the game is
   * `pastMissionBanter()` in the golf script, and it asks
   * `['clean', 'greased', 'perfect'].includes(air.landingQuality)`. Those two
   * sets do not intersect, so for every player who actually flew the mission
   * the good callback was unreachable and Lou always said the "most of the
   * plane came back" line — including after a perfect landing. (The apartment
   * preview seeded a fourth vocabulary, `'smooth'`, which also misses.)
   *
   * So the two facts are now recorded as two fields: `landingQuality` is a
   * token in the vocabulary the readers actually use, and `rank` is the
   * display string the end card shows. Nothing has to guess which it is
   * holding.
   *
   * `unlocks` is the other half of the owner's question — *"Do we actually get
   * all the things rewards from this back in the apartment after?"* The end
   * card lists six trophies and, until now, listed them out of a hard-coded
   * array that was never written anywhere. Only one of the six (Tammy's
   * dashboard mug) appeared in the flat, and it appeared off `status ===
   * 'complete'` rather than off having earned it. They are campaign facts now,
   * in the same shape PROJECT SILENT SQUATCH uses for its trophy, so the
   * apartment can fold a shelf out of what happened instead of out of a guess.
   *
   * @param {object} [outcome]
   * @param {string} [outcome.landingQuality] one of LANDING_QUALITIES
   * @param {string} [outcome.rank] the end card's display rank
   * @param {string[]} [outcome.unlocks] reward ids actually earned
   * @param {number} [outcome.packagesDelivered]
   * @param {number} [outcome.gunsDelivered]
   */
  complete({ landingQuality, rank, unlocks, packagesDelivered, gunsDelivered } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    if (mission.status !== 'in_progress'
      || mission.checkpoint !== 'landed_home'
      || !mission.cargoLoaded) return false;
    this.campaign.update((state) => {
      const completed = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
      completed.status = 'complete';
      completed.landingQuality = LANDING_QUALITIES.includes(landingQuality)
        ? landingQuality : 'unknown';
      completed.rank = typeof rank === 'string' ? rank : null;
      completed.unlocks = Array.isArray(unlocks)
        ? [...new Set(unlocks.filter((id) => AIRSTRIP_UNLOCKS.includes(id)))]
        : [];
      completed.packagesDelivered = Number.isFinite(packagesDelivered)
        ? Math.max(0, Math.round(packagesDelivered)) : 0;
      completed.gunsDelivered = Number.isFinite(gunsDelivered)
        ? Math.max(0, Math.round(gunsDelivered)) : 0;
    });
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_AIRSTRIP);
    return true;
  }
}

export function createAirstripStory(options) {
  return new AirstripStory(options);
}
