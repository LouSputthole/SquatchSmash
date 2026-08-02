import {
  BANK_HEIST_CHECKPOINT_IDS,
  BANK_HEIST_OUTCOMES,
  EVENT_IDS,
  MISSION_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

const PREVIOUS_CHECKPOINT = Object.freeze({
  safehouse_ready: null,
  bank_secured: 'safehouse_ready',
  vault_open: 'bank_secured',
  street_withdrawal: 'vault_open',
  mercer_garage: 'street_withdrawal',
  vehicle_swap: 'mercer_garage',
});

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function inferredOutcome(mission) {
  if (mission.civiliansHarmed === 0
    && mission.compromisedCash === 0
    && mission.bagsRecovered >= 7
    && mission.disciplinedFire
    && mission.followedSnow) return 'professional';
  if (mission.bagsRecovered <= 4
    || Object.values(mission.crewInjuries).includes('severe')) return 'costly_success';
  if (mission.policeHeat >= 75 || mission.vehicleDamage >= 75) return 'hard_exit';
  return 'barely_clean';
}

export function computeHeistSettlement(report = {}) {
  const grossTake = Math.max(0, integer(report.grossTake));
  const compromisedCash = Math.max(0, Math.min(grossTake, integer(report.compromisedCash)));
  const injuryCost = Object.values(report.crewInjuries ?? {}).reduce((sum, grade) => (
    sum + ({ minor: 5_000, moderate: 10_000, severe: 25_000 }[grade] ?? 0)
  ), 0);
  const operationalLoss = Math.min(
    Math.max(0, grossTake - compromisedCash),
    (report.primaryVanLost === false ? 0 : 25_000)
      + Math.round(Math.max(0, Math.min(100, number(report.vehicleDamage))) * 500)
      + injuryCost,
  );
  const distributable = Math.max(0, grossTake - compromisedCash - operationalLoss);
  const familyShare = Math.floor(distributable * 0.5);
  const crewShare = Math.floor(distributable * 0.4);
  const prospectShare = distributable - familyShare - crewShare;
  return { operationalLoss, familyShare, crewShare, prospectShare };
}

/**
 * Narrow campaign Adapter for THE TAKE.
 *
 * The mission runtime owns actors, bags, weapons, vehicles, timelines and full
 * checkpoint snapshots. This Module persists only the facts the apartment or
 * a later Initiation integration may ask about. Every checkpoint and result is
 * a required write: gameplay never announces saved cash that only exists in
 * memory.
 */
class BankHeistStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.BANK_HEIST];
    if (mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    /* THE TAKE is the afternoon half of Day Four. Version 9 grandfathers
     * saves that had already reached the heist before Silver Pines existed,
     * so every current route -- including a resumed checkpoint -- can state
     * this prerequisite honestly. */
    if (state.missions[MISSION_IDS.SILVER_PINES].status !== 'complete') {
      return { ok: false, reason: 'golf_incomplete' };
    }
    if (mission.status === 'in_progress') {
      return { ok: true, resumed: true, checkpoint: mission.checkpoint };
    }
    if (state.missions[MISSION_IDS.SILVER_ROOM].status !== 'complete') {
      return { ok: false, reason: 'silver_incomplete' };
    }
    if (state.events[EVENT_IDS.LOU_HEIST_CALL].status !== 'answered') {
      return { ok: false, reason: 'lou_call_incomplete' };
    }
    if (!mission.preparationComplete) {
      return { ok: false, reason: 'preparation_incomplete' };
    }
    if (mission.status !== 'available') return { ok: false, reason: 'mission_locked' };

    this.campaign.updateRequired((next) => {
      next.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
    });
    return { ok: true, resumed: false, checkpoint: null };
  }

  checkpoint(name, facts = {}) {
    if (!BANK_HEIST_CHECKPOINT_IDS.includes(name)) return false;
    const mission = this.campaign.state.missions[MISSION_IDS.BANK_HEIST];
    if (mission.status !== 'in_progress') return false;
    if (mission.checkpoint !== PREVIOUS_CHECKPOINT[name]) return false;

    this.campaign.updateRequired((state) => {
      const active = state.missions[MISSION_IDS.BANK_HEIST];
      active.checkpoint = name;
      if (name === 'safehouse_ready') active.briefingComplete = true;
      if (name === 'bank_secured') {
        active.bankEntered = true;
        active.guardsDisarmed = integer(facts.guardsDisarmed, active.guardsDisarmed);
        active.civiliansHarmed = integer(facts.civiliansHarmed, active.civiliansHarmed);
      }
      if (name === 'vault_open') {
        active.vaultOpened = true;
        active.alarmTriggered = facts.alarmTriggered !== false;
        active.bagsStaged = integer(facts.bagsStaged, active.bagsStaged);
      }
      if (name === 'street_withdrawal') {
        active.primaryVanLost = facts.primaryVanLost !== false;
        active.policeHeat = number(facts.policeHeat, active.policeHeat);
      }
      if (name === 'mercer_garage') {
        active.bagsRecovered = integer(facts.bagsRecovered, active.bagsRecovered);
        if (facts.crewInjuries && typeof facts.crewInjuries === 'object') {
          Object.assign(active.crewInjuries, facts.crewInjuries);
        }
        active.droppedBagRecovered = facts.droppedBagRecovered === true;
      }
      if (name === 'vehicle_swap') {
        active.playerDroveEscape = facts.playerDroveEscape !== false;
        active.vehicleDamage = number(facts.vehicleDamage, active.vehicleDamage);
      }
    });
    return true;
  }

  complete(report = {}) {
    const current = this.campaign.state.missions[MISSION_IDS.BANK_HEIST];
    if (current.status !== 'in_progress'
      || current.checkpoint !== 'vehicle_swap'
      || !current.vaultOpened
      || current.crewSurvived === false) return false;

    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_BANK_HEIST, (state) => {
      const done = state.missions[MISSION_IDS.BANK_HEIST];
      done.status = 'complete';
      done.bagsStaged = integer(report.bagsStaged, Math.max(done.bagsStaged, report.bagsRecovered ?? 0));
      done.bagsRecovered = integer(report.bagsRecovered, done.bagsRecovered);
      done.grossTake = integer(report.grossTake, done.grossTake);
      done.compromisedCash = integer(report.compromisedCash, done.compromisedCash);
      done.playerInjury = typeof report.playerInjury === 'string'
        ? report.playerInjury : done.playerInjury;
      if (report.crewInjuries && typeof report.crewInjuries === 'object') {
        Object.assign(done.crewInjuries, report.crewInjuries);
      }
      done.optionalVaultBagTaken = report.optionalVaultBagTaken === true;
      done.followedSnow = report.followedSnow !== false;
      done.disciplinedFire = report.disciplinedFire !== false;
      done.crewSurvived = true;
      Object.assign(done, computeHeistSettlement({
        grossTake: done.grossTake,
        compromisedCash: done.compromisedCash,
        vehicleDamage: done.vehicleDamage,
        crewInjuries: done.crewInjuries,
        primaryVanLost: done.primaryVanLost,
      }));
      done.cleanup.finalCalls = true;
      done.outcome = BANK_HEIST_OUTCOMES.includes(report.outcome)
        ? report.outcome : inferredOutcome(done);
      state.story.chapter = 'post_heist';
      state.missions[MISSION_IDS.INITIATION].status = 'available';
    }, { required: true });
    return true;
  }
}

export function createBankHeistStory(options) {
  return new BankHeistStory(options);
}
