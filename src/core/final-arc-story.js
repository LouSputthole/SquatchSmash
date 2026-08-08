import {
  CARTEL_PALACE_ALARM_REASONS,
  CARTEL_PALACE_CHECKPOINT_IDS,
  CARTEL_PALACE_EVIDENCE_IDS,
  CARTEL_PALACE_OUTCOMES,
  ENOLA_SQUATCH_CHECKPOINT_IDS,
  normalizeEnolaCheckpointSnapshot,
  ITEM_IDS,
  MANSION_SIEGE_CHECKPOINT_IDS,
  MISSION_IDS,
  SILVER_CASE_CHECKPOINT_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

class SilverCaseCampaignStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.SILVER_CASE];
  }

  begin() {
    if (this.mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (this.mission.status === 'locked') return { ok: false, reason: 'locked' };
    if (this.mission.status === 'in_progress') {
      return { ok: true, resumed: true, checkpoint: this.mission.checkpoint };
    }
    this.campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_CASE, (state) => {
      state.missions[MISSION_IDS.SILVER_CASE].status = 'in_progress';
      state.story.chapter = 'silver_case';
    });
    return { ok: true, resumed: false };
  }

  checkpoint(id, facts = {}) {
    if (!SILVER_CASE_CHECKPOINT_IDS.includes(id) || this.mission.status !== 'in_progress') {
      return false;
    }
    const reached = SILVER_CASE_CHECKPOINT_IDS.indexOf(id);
    const current = SILVER_CASE_CHECKPOINT_IDS.indexOf(this.mission.checkpoint);
    this.campaign.update((state) => {
      const mission = state.missions[MISSION_IDS.SILVER_CASE];
      if (reached > current) mission.checkpoint = id;
      // These are monotonic facts: once Ape has been irritated or has fired a
      // finishing shot, a later/repeated checkpoint cannot undo it.
      mission.irritatedApe ||= facts.irritatedApe === true;
      mission.apeFinishedChester ||= facts.apeFinishedChester === true;
      mission.apeFinishedWinston ||= facts.apeFinishedWinston === true;
      // Winston's branch is only final on entering PICK_UP_CASE. Before that,
      // an alive Winston means "not decided yet", not necessarily "spared".
      if (id === 'case_recovered'
        && ['spared', 'player_killed', 'ape_killed'].includes(facts.winstonOutcome)) {
        mission.winstonOutcome = facts.winstonOutcome;
      }
    });
    return true;
  }

  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SILVER_CASE, (state) => {
      const mission = state.missions[MISSION_IDS.SILVER_CASE];
      mission.status = 'complete';
      mission.checkpoint = 'case_recovered';
      mission.caseRecovered = true;
      if (['spared', 'player_killed', 'ape_killed'].includes(report.winstonOutcome)) {
        mission.winstonOutcome = report.winstonOutcome;
      }
      mission.irritatedApe ||= report.irritatedApe === true;
      mission.apeFinishedChester ||= report.apeFinishedChester === true;
      mission.apeFinishedWinston ||= report.apeFinishedWinston === true;
      state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'available';
      state.story.chapter = 'mansion';
      state.inventory.concealed = state.inventory.concealed
        .filter((id) => id !== ITEM_IDS.SILVER_CASE);
      if (!state.inventory.carried.includes(ITEM_IDS.SILVER_CASE)) {
        state.inventory.carried.push(ITEM_IDS.SILVER_CASE);
      }
    });
    return true;
  }
}

export function createSilverCaseCampaignStory(options) {
  return new SilverCaseCampaignStory(options);
}

class MansionSiegeCampaignStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.MANSION_SIEGE];
  }

  begin() {
    if (this.mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (this.mission.status === 'locked') return { ok: false, reason: 'locked' };
    if (this.mission.status === 'in_progress') {
      return { ok: true, resumed: true, checkpoint: this.mission.checkpoint };
    }
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.MANSION_SIEGE].status = 'in_progress';
      state.story.chapter = 'mansion_siege';
    });
    return { ok: true, resumed: false };
  }

  checkpoint(id, facts = {}) {
    if (!MANSION_SIEGE_CHECKPOINT_IDS.includes(id)
      || this.mission.status !== 'in_progress') return false;
    const reached = MANSION_SIEGE_CHECKPOINT_IDS.indexOf(id);
    const current = MANSION_SIEGE_CHECKPOINT_IDS.indexOf(this.mission.checkpoint);
    this.campaign.update((state) => {
      const mission = state.missions[MISSION_IDS.MANSION_SIEGE];
      if (reached > current) mission.checkpoint = id;
      if (Number.isFinite(facts.attackersDown)) {
        mission.attackersDown = Math.max(mission.attackersDown, Math.round(facts.attackersDown));
      }
      mission.littleFriendSaid ||= facts.littleFriendSaid === true;
      mission.sasoleMet ||= facts.sasoleMet === true;
    });
    return true;
  }

  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE, (state) => {
      const mission = state.missions[MISSION_IDS.MANSION_SIEGE];
      mission.status = 'complete';
      mission.checkpoint = 'wave_one';
      if (Number.isFinite(report.attackersDown)) {
        mission.attackersDown = Math.max(mission.attackersDown, Math.round(report.attackersDown));
      }
      mission.littleFriendSaid ||= report.littleFriendSaid === true;
      mission.sasoleMet ||= report.sasoleMet === true;
      state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'available';
      state.story.chapter = 'enola_squatch';
    });
    return true;
  }
}

export function createMansionSiegeCampaignStory(options) {
  return new MansionSiegeCampaignStory(options);
}

class EnolaSquatchCampaignStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.ENOLA_SQUATCH];
  }

  begin() {
    if (this.mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (this.mission.status === 'locked') return { ok: false, reason: 'locked' };
    if (this.mission.status === 'in_progress') {
      return {
        ok: true,
        resumed: true,
        checkpoint: this.mission.checkpoint,
        checkpointSnapshot: this.mission.checkpointSnapshot,
      };
    }
    this.campaign.advanceTime(TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH, (state) => {
      state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'in_progress';
      state.story.chapter = 'enola_squatch';
    });
    return { ok: true, resumed: false };
  }

  checkpoint(id, facts = {}) {
    if (!ENOLA_SQUATCH_CHECKPOINT_IDS.includes(id)
      || this.mission.status !== 'in_progress') return false;
    const reached = ENOLA_SQUATCH_CHECKPOINT_IDS.indexOf(id);
    const current = ENOLA_SQUATCH_CHECKPOINT_IDS.indexOf(this.mission.checkpoint);
    const checkpointSnapshot = normalizeEnolaCheckpointSnapshot(
      facts.checkpointSnapshot,
      id,
    );
    this.campaign.update((state) => {
      const mission = state.missions[MISSION_IDS.ENOLA_SQUATCH];
      if (reached > current) mission.checkpoint = id;
      if (reached >= current && checkpointSnapshot) {
        mission.checkpointSnapshot = checkpointSnapshot;
      }
      mission.payloadReleased ||= facts.payloadReleased === true;
    });
    return true;
  }

  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH, (state) => {
      const mission = state.missions[MISSION_IDS.ENOLA_SQUATCH];
      mission.status = 'complete';
      mission.checkpoint = 'return';
      mission.rank = typeof report.rank === 'string' ? report.rank : null;
      mission.score = Number.isFinite(report.score)
        ? report.score : (Number.isFinite(report.total) ? report.total : 0);
      mission.unlocks = Array.isArray(report.unlocks) ? report.unlocks : [];
      mission.payloadReleased ||= report.payloadReleased === true;
      mission.returnedHome = report.returnedHome !== false;
      state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
      state.story.chapter = 'mansion_return';
    });
    return true;
  }
}

export function createEnolaSquatchCampaignStory(options) {
  return new EnolaSquatchCampaignStory(options);
}

class MansionReturnCampaignStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.MANSION_RETURN];
  }

  begin() {
    if (this.mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (this.mission.status === 'locked') return { ok: false, reason: 'locked' };
    if (this.mission.status === 'in_progress') return { ok: true, resumed: true };
    this.campaign.advanceTime(TIME_EVENT_IDS.RETURN_TO_MANSION, (state) => {
      state.missions[MISSION_IDS.MANSION_RETURN].status = 'in_progress';
      state.story.chapter = 'mansion_return';
    });
    return { ok: true, resumed: false };
  }

  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    if (report.wrongCityConfirmed !== true
      || report.sauceMissingConfirmed !== true
      || report.palaceLocationKnown !== true) return false;
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_MANSION_RETURN, (state) => {
      const mission = state.missions[MISSION_IDS.MANSION_RETURN];
      mission.status = 'complete';
      mission.briefingComplete = true;
      mission.wrongCityConfirmed = report.wrongCityConfirmed === true;
      mission.sauceMissingConfirmed = report.sauceMissingConfirmed === true;
      mission.palaceLocationKnown = report.palaceLocationKnown === true;
      state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
      state.story.chapter = 'cartel_palace';
    });
    return true;
  }
}

export function createMansionReturnCampaignStory(options) {
  return new MansionReturnCampaignStory(options);
}

function mergedStrings(...values) {
  return [...new Set(values.flat().filter((value) => typeof value === 'string'))];
}

class CartelPalaceCampaignStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.CARTEL_PALACE];
  }

  begin() {
    if (this.mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (this.mission.status === 'locked') return { ok: false, reason: 'locked' };
    if (this.mission.status === 'in_progress') {
      return { ok: true, resumed: true, checkpoint: this.mission.checkpoint };
    }
    this.campaign.advanceTime(TIME_EVENT_IDS.DEPART_CARTEL_PALACE, (state) => {
      state.missions[MISSION_IDS.CARTEL_PALACE].status = 'in_progress';
      state.story.chapter = 'cartel_palace';
    });
    return { ok: true, resumed: false };
  }

  checkpoint(id, facts = {}) {
    if (!CARTEL_PALACE_CHECKPOINT_IDS.includes(id)
      || this.mission.status !== 'in_progress') return false;
    const reached = CARTEL_PALACE_CHECKPOINT_IDS.indexOf(id);
    const current = CARTEL_PALACE_CHECKPOINT_IDS.indexOf(this.mission.checkpoint);
    this.campaign.update((state) => {
      const mission = state.missions[MISSION_IDS.CARTEL_PALACE];
      if (reached > current) mission.checkpoint = id;
      mission.evidenceFound = mergedStrings(mission.evidenceFound, facts.evidenceFound ?? [])
        .filter((evidenceId) => CARTEL_PALACE_EVIDENCE_IDS.includes(evidenceId));
      mission.sauceBetrayalConfirmed ||= facts.sauceBetrayalConfirmed === true;
      mission.alarmRaised ||= facts.alarmRaised === true;
      if (!mission.alarmReason && CARTEL_PALACE_ALARM_REASONS.includes(facts.alarmReason)) {
        mission.alarmReason = facts.alarmReason;
      }
      mission.markEliminated ||= facts.markEliminated === true;
      mission.sauceEliminated ||= facts.sauceEliminated === true;
      if (CARTEL_PALACE_OUTCOMES.includes(facts.outcome)) {
        mission.outcome = facts.outcome;
      }
    });
    return true;
  }

  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    const betrayalConfirmed = this.mission.sauceBetrayalConfirmed
      || report.sauceBetrayalConfirmed === true;
    const markEliminated = this.mission.markEliminated || report.markEliminated === true;
    const sauceEliminated = this.mission.sauceEliminated || report.sauceEliminated === true;
    if (!betrayalConfirmed || !markEliminated || !sauceEliminated) return false;

    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE, (state) => {
      const mission = state.missions[MISSION_IDS.CARTEL_PALACE];
      mission.status = 'complete';
      mission.checkpoint = 'clear';
      mission.evidenceFound = mergedStrings(mission.evidenceFound, report.evidenceFound ?? [])
        .filter((evidenceId) => CARTEL_PALACE_EVIDENCE_IDS.includes(evidenceId));
      mission.sauceBetrayalConfirmed = true;
      mission.markEliminated = true;
      mission.sauceEliminated = true;
      if (CARTEL_PALACE_OUTCOMES.includes(report.outcome)) {
        mission.outcome = report.outcome;
      }
      state.missions[MISSION_IDS.INITIATION].status = 'available';
      state.story.chapter = 'big_night';
    });
    return true;
  }
}

export function createCartelPalaceCampaignStory(options) {
  return new CartelPalaceCampaignStory(options);
}
