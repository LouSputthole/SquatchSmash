/**
 * Durable story adapter for the countryside-cabin chapter.
 *
 * The page owns presentation. This module owns authored order, predicates and
 * exact-once campaign markers so every step can be resumed after a reload.
 * No extra save fields are needed: the existing time-event ledger is the
 * chapter state machine.
 */
import { MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS } from './campaign.js';

export const CABIN_HOSTAGE_IDS = Object.freeze({
  COUNTER_STRIKE_PLAYER: 'counter_strike_player',
  ATEAM_MEMBER: 'ateam_member',
});

export const CABIN_HOSTAGE_MAX_HITS = 8;

export const CABIN_HOSTAGE_INTERROGATION_THRESHOLDS = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: 2,
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: 6,
});

const COUNTER_STRIKE_HIT_EVENTS = Object.freeze([
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_1,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_2,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_3,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_4,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_5,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_6,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_7,
  TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_HIT_8,
]);

const ATEAM_HIT_EVENTS = Object.freeze([
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_1,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_2,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_3,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_4,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_5,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_6,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_7,
  TIME_EVENT_IDS.CABIN_ATEAM_HIT_8,
]);

export const CABIN_HOSTAGE_HIT_EVENTS = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: COUNTER_STRIKE_HIT_EVENTS,
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: ATEAM_HIT_EVENTS,
});

const HOSTAGE_DEATH_EVENTS = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_DEAD,
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: TIME_EVENT_IDS.CABIN_ATEAM_DEAD,
});

const HOSTAGE_WRAP_EVENTS = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_WRAPPED,
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: TIME_EVENT_IDS.CABIN_ATEAM_WRAPPED,
});

const HOSTAGE_AT_FIRE_EVENTS = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_AT_FIRE,
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: TIME_EVENT_IDS.CABIN_ATEAM_AT_FIRE,
});

const HOSTAGE_ALIASES = new Map([
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER],
  ['counter_strike', CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER],
  ['counter-strike', CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER],
  ['cs_player', CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER],
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER, CABIN_HOSTAGE_IDS.ATEAM_MEMBER],
  ['ateam', CABIN_HOSTAGE_IDS.ATEAM_MEMBER],
  ['a_team', CABIN_HOSTAGE_IDS.ATEAM_MEMBER],
  ['a-team', CABIN_HOSTAGE_IDS.ATEAM_MEMBER],
]);

export const COUNTRYSIDE_CABIN_LANDMARKS = Object.freeze([
  Object.freeze({
    id: 'creek',
    label: 'Follow the creek crossing',
    shortLabel: 'Creek crossing',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_CREEK,
    legacyEventIds: Object.freeze([]),
    line: 'Cold water, old stones, and nobody close enough to ask what he is doing here.',
  }),
  Object.freeze({
    id: 'overlook',
    label: 'Climb to the ridge overlook',
    shortLabel: 'Ridge overlook',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_OVERLOOK,
    legacyEventIds: Object.freeze([]),
    line: 'The road disappears under the trees. From up here, so does the cabin.',
  }),
  Object.freeze({
    id: 'shed',
    label: 'Check the old forestry shed',
    shortLabel: 'Forestry shed',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_SHED,
    legacyEventIds: Object.freeze([]),
    line: 'Axes, fuel tins, a workbench, and enough dust to prove nobody beat him here.',
  }),
  Object.freeze({
    id: 'range',
    label: 'Walk the old shooting range',
    shortLabel: 'Shooting range',
    eventId: TIME_EVENT_IDS.CABIN_EXPLORE_RANGE,
    legacyEventIds: Object.freeze([TIME_EVENT_IDS.CABIN_EXPLORE_FIREPIT]),
    line: 'Old target frames stand between the pines. The backstop has caught more than weather.',
  }),
]);

const LANDMARK_BY_ID = new Map(COUNTRYSIDE_CABIN_LANDMARKS.map((entry) => [entry.id, entry]));

function canonicalHostageId(id) {
  return typeof id === 'string' ? HOSTAGE_ALIASES.get(id.toLowerCase()) ?? null : null;
}

function normalizedExecutionChoice(choice) {
  if (choice === true) return 'player';
  if (choice === false || choice == null) return 'gratin';
  if (typeof choice !== 'string') return null;
  const value = choice.trim().toLowerCase();
  if (['player', 'tony', 'yes'].includes(value)) return 'player';
  if (['gratin', 'no', 'timeout', ''].includes(value)) return 'gratin';
  return null;
}

export class CountrysideCabinStory {
  constructor({ campaign } = {}) {
    if (!campaign || typeof campaign.advanceTime !== 'function') {
      throw new TypeError('Countryside cabin story requires a campaign');
    }
    this.campaign = campaign;
  }

  has(eventId) {
    return this.campaign.state.story.timeEvents.includes(eventId);
  }

  mark(eventId, change) {
    const result = this.campaign.advanceTime(eventId, change);
    return {
      ok: true,
      firstTime: result.applied,
      applied: result.applied,
      day: result.day,
      timeMinutes: result.timeMinutes,
      minutesAdvanced: result.minutesAdvanced,
    };
  }

  blocked(reason, extra = {}) {
    return { ok: false, reason, ...extra };
  }

  landmarkComplete(landmark) {
    return this.has(landmark.eventId)
      || landmark.legacyEventIds.some((eventId) => this.has(eventId));
  }

  explored() {
    return COUNTRYSIDE_CABIN_LANDMARKS.filter((entry) => this.landmarkComplete(entry));
  }

  explorationCount() {
    return this.explored().length;
  }

  visit(id) {
    const landmark = LANDMARK_BY_ID.get(id);
    if (!landmark) return this.blocked('unknown_landmark');
    if (this.landmarkComplete(landmark)) {
      const story = this.campaign.state.story;
      return {
        ok: true,
        firstVisit: false,
        firstTime: false,
        applied: false,
        landmark,
        day: story.day,
        timeMinutes: story.timeMinutes,
        minutesAdvanced: 0,
      };
    }
    if (!this.openingCallComplete()) return this.blocked('opening_call_incomplete');
    const result = this.mark(landmark.eventId);
    return { ...result, firstVisit: result.firstTime, landmark };
  }

  openingCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL);
  }

  completeOpeningCall() {
    return this.mark(TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL);
  }

  margoHookHandled() {
    return this.has(TIME_EVENT_IDS.CABIN_MARGO_READY);
  }

  margoReady() {
    return this.openingCallComplete()
      && this.explorationCount() >= 1
      && !this.margoHookHandled();
  }

  consumeMargoReady() {
    if (!this.openingCallComplete()) return this.blocked('opening_call_incomplete');
    if (this.margoHookHandled()) return this.mark(TIME_EVENT_IDS.CABIN_MARGO_READY);
    if (this.explorationCount() < 1) return this.blocked('explore_first');
    return this.mark(TIME_EVENT_IDS.CABIN_MARGO_READY);
  }

  gratinCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_GRATIN_CALL);
  }

  gratinCallReady() {
    return this.openingCallComplete()
      && this.explorationCount() >= 2
      && this.margoHookHandled()
      && !this.gratinCallComplete();
  }

  completeGratinCall() {
    if (this.gratinCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_GRATIN_CALL);
    if (!this.gratinCallReady()) return this.blocked('gratin_call_not_ready');
    return this.mark(TIME_EVENT_IDS.CABIN_GRATIN_CALL);
  }

  basementVisible() {
    return this.gratinCallComplete();
  }

  returnToCabinLineComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_RETURN_TO_CABIN_LINE);
  }

  completeReturnToCabinLine() {
    if (this.returnToCabinLineComplete()) {
      return this.mark(TIME_EVENT_IDS.CABIN_RETURN_TO_CABIN_LINE);
    }
    if (!this.gratinCallComplete()) return this.blocked('gratin_call_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_RETURN_TO_CABIN_LINE);
  }

  dungeonPrimary() {
    return this.gratinCallComplete();
  }

  cellarOpen() {
    return this.has(TIME_EVENT_IDS.CABIN_CELLAR_OPEN);
  }

  openCellar() {
    if (this.cellarOpen()) return this.mark(TIME_EVENT_IDS.CABIN_CELLAR_OPEN);
    if (!this.basementVisible()) return this.blocked('basement_hidden');
    return this.mark(TIME_EVENT_IDS.CABIN_CELLAR_OPEN);
  }

  dungeonEntered() {
    return this.has(TIME_EVENT_IDS.CABIN_DUNGEON_ENTERED);
  }

  enterDungeon() {
    if (this.dungeonEntered()) return this.mark(TIME_EVENT_IDS.CABIN_DUNGEON_ENTERED);
    if (!this.cellarOpen()) return this.blocked('cellar_closed');
    return this.mark(TIME_EVENT_IDS.CABIN_DUNGEON_ENTERED);
  }

  hostageState(id) {
    const hostageId = canonicalHostageId(id);
    if (!hostageId) return null;
    const hitEvents = CABIN_HOSTAGE_HIT_EVENTS[hostageId];
    const hits = hitEvents.reduce((total, eventId) => total + Number(this.has(eventId)), 0);
    const threshold = CABIN_HOSTAGE_INTERROGATION_THRESHOLDS[hostageId];
    const remaining = Math.max(0, CABIN_HOSTAGE_MAX_HITS - hits);
    const ready = hits >= threshold;
    return {
      id: hostageId,
      hits,
      maxHits: CABIN_HOSTAGE_MAX_HITS,
      threshold,
      interrogationThreshold: threshold,
      hitsUntilReady: Math.max(0, threshold - hits),
      ready,
      health: remaining,
      maxHealth: CABIN_HOSTAGE_MAX_HITS,
      remaining,
      interrogationReady: ready,
      interrogationComplete: ready,
      durabilityDepleted: remaining === 0,
      dead: this.has(HOSTAGE_DEATH_EVENTS[hostageId]),
      wrapped: this.has(HOSTAGE_WRAP_EVENTS[hostageId]),
      atFire: this.has(HOSTAGE_AT_FIRE_EVENTS[hostageId]),
    };
  }

  hitHostage(id, { hits = 1 } = {}) {
    const hostage = this.hostageState(id);
    if (!hostage) return this.blocked('unknown_hostage');
    if (!this.dungeonEntered()) return this.blocked('dungeon_not_entered', { hostage });
    if (hostage.dead) return this.blocked('hostage_dead', { hostage });
    if (!Number.isSafeInteger(hits) || hits < 1) return this.blocked('invalid_hit_count', { hostage });

    const executionChosen = Boolean(this.executionChoice());
    const limit = executionChosen ? CABIN_HOSTAGE_MAX_HITS : hostage.threshold;
    if (hostage.hits >= limit) {
      return this.blocked(
        executionChosen ? 'durability_depleted' : 'interrogation_ready',
        { hostage },
      );
    }

    const hitsToApply = Math.min(hits, limit - hostage.hits);
    const available = CABIN_HOSTAGE_HIT_EVENTS[hostage.id]
      .filter((eventId) => !this.has(eventId))
      .slice(0, hitsToApply);
    let last = null;
    for (const eventId of available) last = this.mark(eventId);
    const current = this.hostageState(hostage.id);
    return {
      ok: true,
      firstTime: available.length > 0,
      applied: available.length > 0,
      hitsApplied: available.length,
      requestedHits: hits,
      day: last?.day ?? this.campaign.state.story.day,
      timeMinutes: last?.timeMinutes ?? this.campaign.state.story.timeMinutes,
      minutesAdvanced: 0,
      hostage: current,
    };
  }

  /** Pistol/cinematic damage uses the same eight exact-once durability slots. */
  damageHostage(id, options) {
    const hostage = this.hostageState(id);
    if (!hostage) return this.blocked('unknown_hostage');
    if (!this.executionChoice()) return this.blocked('execution_not_chosen', { hostage });
    return this.hitHostage(hostage.id, options);
  }

  interrogationThreshold(id) {
    return this.hostageState(id)?.threshold ?? null;
  }

  hostageInterrogationReady(id) {
    return this.hostageState(id)?.interrogationReady ?? false;
  }

  interrogationReady(id) {
    return id === undefined
      ? this.interrogationComplete()
      : this.hostageInterrogationReady(id);
  }

  interrogationComplete() {
    return Object.values(CABIN_HOSTAGE_IDS)
      .every((id) => this.hostageState(id).interrogationReady);
  }

  ateamIntelLearned() {
    return this.has(TIME_EVENT_IDS.CABIN_ATEAM_INTEL_LEARNED);
  }

  learnAteamIntel() {
    if (this.ateamIntelLearned()) return this.mark(TIME_EVENT_IDS.CABIN_ATEAM_INTEL_LEARNED);
    if (!this.interrogationComplete()) return this.blocked('interrogation_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_ATEAM_INTEL_LEARNED);
  }

  /** Legacy method names read the same marker; no mole identity is revealed. */
  moleRevealed() {
    return this.ateamIntelLearned();
  }

  revealMole() {
    return this.learnAteamIntel();
  }

  executionChoice() {
    if (this.has(TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER)) return 'player';
    if (this.has(TIME_EVENT_IDS.CABIN_EXECUTION_GRATIN)) return 'gratin';
    return null;
  }

  executionBranch() {
    const choice = this.executionChoice();
    if (choice === 'player') return 'yes';
    if (choice !== 'gratin') return null;
    return this.has(TIME_EVENT_IDS.CABIN_EXECUTION_TIMEOUT_SELECTED) ? 'timeout' : 'no';
  }

  executionBranchVoComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_EXECUTION_BRANCH_VO_COMPLETE);
  }

  completeExecutionBranchVo() {
    if (this.executionBranchVoComplete()) {
      return this.mark(TIME_EVENT_IDS.CABIN_EXECUTION_BRANCH_VO_COMPLETE);
    }
    if (!this.executionChoice()) return this.blocked('execution_not_chosen');
    return this.mark(TIME_EVENT_IDS.CABIN_EXECUTION_BRANCH_VO_COMPLETE);
  }

  chooseExecution(choice, { reason = 'player' } = {}) {
    const existing = this.executionChoice();
    if (existing) {
      const story = this.campaign.state.story;
      return {
        ok: true,
        firstTime: false,
        applied: false,
        choice: existing,
        day: story.day,
        timeMinutes: story.timeMinutes,
        minutesAdvanced: 0,
      };
    }
    if (!this.ateamIntelLearned()) return this.blocked('ateam_intel_not_learned');
    const selected = normalizedExecutionChoice(choice);
    if (!selected) return this.blocked('unknown_execution_choice');
    const eventId = selected === 'player'
      ? TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER
      : TIME_EVENT_IDS.CABIN_EXECUTION_GRATIN;
    const result = this.mark(eventId);
    const normalizedChoice = typeof choice === 'string' ? choice.trim().toLowerCase() : '';
    if (selected === 'gratin' && (reason === 'timeout' || normalizedChoice === 'timeout')) {
      this.mark(TIME_EVENT_IDS.CABIN_EXECUTION_TIMEOUT_SELECTED);
    }
    return { ...result, choice: selected };
  }

  hostageDead(id) {
    return this.hostageState(id)?.dead ?? false;
  }

  killHostage(id) {
    const hostage = this.hostageState(id);
    if (!hostage) return this.blocked('unknown_hostage');
    if (hostage.dead) return { ...this.mark(HOSTAGE_DEATH_EVENTS[hostage.id]), hostage };
    if (!this.executionChoice()) return this.blocked('execution_not_chosen', { hostage });
    if (!hostage.durabilityDepleted) {
      return this.blocked('hostage_not_depleted', { hostage });
    }
    const result = this.mark(HOSTAGE_DEATH_EVENTS[hostage.id]);
    return { ...result, hostage: this.hostageState(hostage.id) };
  }

  deathsComplete() {
    return Object.values(CABIN_HOSTAGE_IDS).every((id) => this.hostageDead(id));
  }

  nightfallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_NIGHTFALL);
  }

  nightfallReached() {
    return this.nightfallComplete();
  }

  completeNightfall() {
    if (this.nightfallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_NIGHTFALL);
    if (!this.deathsComplete()) return this.blocked('executions_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_NIGHTFALL);
  }

  nightfallBriefingComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_NIGHTFALL_BRIEFING_COMPLETE);
  }

  completeNightfallBriefing() {
    if (this.nightfallBriefingComplete()) {
      return this.mark(TIME_EVENT_IDS.CABIN_NIGHTFALL_BRIEFING_COMPLETE);
    }
    if (!this.nightfallComplete()) return this.blocked('nightfall_not_reached');
    return this.mark(TIME_EVENT_IDS.CABIN_NIGHTFALL_BRIEFING_COMPLETE);
  }

  reachNightfall() {
    return this.completeNightfall();
  }

  wrapHostage(id) {
    const hostage = this.hostageState(id);
    if (!hostage) return this.blocked('unknown_hostage');
    if (hostage.wrapped) return { ...this.mark(HOSTAGE_WRAP_EVENTS[hostage.id]), hostage };
    if (!hostage.dead) return this.blocked('hostage_alive', { hostage });
    if (!this.nightfallComplete()) return this.blocked('nightfall_not_reached', { hostage });
    const result = this.mark(HOSTAGE_WRAP_EVENTS[hostage.id]);
    return { ...result, hostage: this.hostageState(hostage.id) };
  }

  wrappingComplete() {
    return Object.values(CABIN_HOSTAGE_IDS).every((id) => this.hostageState(id).wrapped);
  }

  bodyAtFire(id) {
    const hostageId = canonicalHostageId(id);
    if (!hostageId) return false;
    return this.has(HOSTAGE_AT_FIRE_EVENTS[hostageId])
      || this.has(TIME_EVENT_IDS.CABIN_BODIES_STAGED);
  }

  moveBodyToFire(id) {
    const hostage = this.hostageState(id);
    if (!hostage) return this.blocked('unknown_hostage');
    if (this.has(HOSTAGE_AT_FIRE_EVENTS[hostage.id])) {
      return { ...this.mark(HOSTAGE_AT_FIRE_EVENTS[hostage.id]), hostage: this.hostageState(hostage.id) };
    }
    if (this.has(TIME_EVENT_IDS.CABIN_BODIES_STAGED)) {
      const story = this.campaign.state.story;
      return {
        ok: true,
        firstTime: false,
        applied: false,
        hostage: { ...hostage, atFire: true },
        day: story.day,
        timeMinutes: story.timeMinutes,
        minutesAdvanced: 0,
      };
    }
    if (!hostage.wrapped) return this.blocked('body_not_wrapped', { hostage });
    const result = this.mark(HOSTAGE_AT_FIRE_EVENTS[hostage.id]);
    return { ...result, hostage: this.hostageState(hostage.id) };
  }

  carryBodyToFire(id) {
    return this.moveBodyToFire(id);
  }

  bodiesAtFire() {
    return Object.values(CABIN_HOSTAGE_IDS).every((id) => this.bodyAtFire(id));
  }

  bodiesStaged() {
    return this.bodiesAtFire();
  }

  /** Optional aggregate marker for legacy callers; new play records each body. */
  stageBodies() {
    if (this.has(TIME_EVENT_IDS.CABIN_BODIES_STAGED)) {
      return this.mark(TIME_EVENT_IDS.CABIN_BODIES_STAGED);
    }
    if (!this.bodiesAtFire()) return this.blocked('bodies_not_at_fire');
    return this.mark(TIME_EVENT_IDS.CABIN_BODIES_STAGED);
  }

  gasPoured() {
    return this.has(TIME_EVENT_IDS.CABIN_GAS_POURED);
  }

  pourGas() {
    if (this.gasPoured()) return this.mark(TIME_EVENT_IDS.CABIN_GAS_POURED);
    if (!this.bodiesAtFire()) return this.blocked('bodies_not_at_fire');
    return this.mark(TIME_EVENT_IDS.CABIN_GAS_POURED);
  }

  bonfireIgnited() {
    return this.has(TIME_EVENT_IDS.CABIN_BONFIRE_IGNITED);
  }

  igniteBonfire() {
    if (this.bonfireIgnited()) return this.mark(TIME_EVENT_IDS.CABIN_BONFIRE_IGNITED);
    if (!this.gasPoured()) return this.blocked('gas_not_poured');
    return this.mark(TIME_EVENT_IDS.CABIN_BONFIRE_IGNITED);
  }

  fireCleanupComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_FIRE_CLEANUP);
  }

  completeFireCleanup() {
    if (this.fireCleanupComplete()) return this.mark(TIME_EVENT_IDS.CABIN_FIRE_CLEANUP);
    if (!this.bonfireIgnited()) return this.blocked('bonfire_not_ignited');
    return this.mark(TIME_EVENT_IDS.CABIN_FIRE_CLEANUP);
  }

  drankAfterCleanup() {
    return this.has(TIME_EVENT_IDS.CABIN_DRINK);
  }

  drink() {
    if (this.drankAfterCleanup()) return this.mark(TIME_EVENT_IDS.CABIN_DRINK);
    if (!this.fireCleanupComplete()) return this.blocked('fire_not_clean');
    return this.mark(TIME_EVENT_IDS.CABIN_DRINK);
  }

  blackedOut() {
    return this.has(TIME_EVENT_IDS.CABIN_BLACKOUT);
  }

  blackout() {
    if (this.blackedOut()) return this.mark(TIME_EVENT_IDS.CABIN_BLACKOUT);
    if (!this.drankAfterCleanup()) return this.blocked('drink_first');
    return this.mark(TIME_EVENT_IDS.CABIN_BLACKOUT, (state) => {
      state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'wake' };
    });
  }

  morningCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_MORNING_CALL);
  }

  completeMorningCall() {
    if (this.morningCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_MORNING_CALL);
    if (!this.blackedOut()) return this.blocked('morning_not_reached');
    return this.mark(TIME_EVENT_IDS.CABIN_MORNING_CALL);
  }

  morningWakeComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE);
  }

  completeMorningWake() {
    if (this.morningWakeComplete()) return this.mark(TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE);
    if (!this.morningCallComplete()) return this.blocked('morning_call_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE);
  }

  chapterComplete() {
    return this.morningWakeComplete();
  }

  phase() {
    if (!this.openingCallComplete()) return 'opening_call';
    if (!this.gratinCallComplete()) return this.explorationCount() < 2 ? 'explore' : 'gratin_call';
    if (!this.cellarOpen()) return 'open_cellar';
    if (!this.dungeonEntered()) return 'enter_dungeon';
    if (!this.interrogationComplete()) return 'interrogation';
    if (!this.ateamIntelLearned()) return 'ateam_intel';
    if (!this.executionChoice()) return 'execution_choice';
    if (!this.deathsComplete()) return 'execution';
    if (!this.nightfallComplete()) return 'nightfall';
    if (!this.wrappingComplete()) return 'wrap_bodies';
    if (!this.bodiesAtFire()) return 'carry_bodies';
    if (!this.gasPoured()) return 'pour_gas';
    if (!this.bonfireIgnited()) return 'ignite_bonfire';
    if (!this.fireCleanupComplete()) return 'fire_cleanup';
    if (!this.drankAfterCleanup()) return 'drink';
    if (!this.blackedOut()) return 'blackout';
    if (!this.morningCallComplete()) return 'morning_call';
    if (!this.morningWakeComplete()) return 'morning_wake';
    return 'complete';
  }

  /** Kept as a legacy-save predicate; CABIN_REST no longer gates this chapter. */
  rested() {
    return this.has(TIME_EVENT_IDS.CABIN_REST);
  }

  /** Kept for old callers. It remains exact-once but does not unlock the car. */
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

  tryLeave() {
    const silverCase = this.campaign.state.missions[MISSION_IDS.SILVER_CASE];
    if (silverCase?.status === 'complete') {
      return {
        kind: 'stay',
        id: 'cabin_stay_over',
        line: 'The next thing already started. This place did its job.',
      };
    }
    if (silverCase?.status !== 'available' && silverCase?.status !== 'in_progress') {
      return {
        kind: 'stay',
        id: 'cabin_wait',
        line: 'Lou said stay put. The road can wait until the phone says otherwise.',
      };
    }
    if (!this.morningWakeComplete()) {
      return {
        kind: 'stay',
        id: 'cabin_chapter_incomplete',
        line: 'The car stays where it is until the work below is finished and morning comes.',
      };
    }
    return { kind: 'go', destination: SCENE_IDS.SILVER_CASE };
  }

  /**
   * One spoiler-safe standing order and, at most, one immediate soft step.
   *
   * Durable event markers remain the complete chapter ledger. They are not a
   * player-facing checklist: showing the whole ledger exposed future turns,
   * made cleanup read as six unrelated missions, and buried the action the
   * player could actually take. The HUD and pause menu consume this projection
   * instead.
   */
  objectivePlan() {
    const phase = this.phase();
    const plan = (id, label, step) => Object.freeze({ id, label, step });

    if (phase === 'opening_call') {
      return plan('cabin.lay_low', 'Lay low at the cabin', 'Answer Lou’s call');
    }
    if (phase === 'explore') {
      return plan(
        'cabin.lay_low',
        'Lay low at the cabin',
        `Explore the property · ${Math.min(this.explorationCount(), 2)}/2 sites checked`,
      );
    }
    if (phase === 'gratin_call') {
      return plan('cabin.lay_low', 'Lay low at the cabin', 'Answer Gratin’s call');
    }
    if (phase === 'open_cellar') {
      return plan('cabin.find_gratin', 'Find Gratin', 'Return to the cabin · follow the Supreme Leader');
    }
    if (phase === 'enter_dungeon') {
      return plan('cabin.find_gratin', 'Find Gratin', 'Search the cellar');
    }
    if (phase === 'interrogation') {
      const ready = Object.values(CABIN_HOSTAGE_IDS)
        .filter((id) => this.hostageInterrogationReady(id)).length;
      return plan(
        'cabin.help_gratin',
        'Help Gratin get answers',
        `Use the tools on both prisoners · ${ready}/2 talking`,
      );
    }
    if (phase === 'ateam_intel') {
      return plan('cabin.help_gratin', 'Help Gratin get answers', 'Hear the prisoner out');
    }
    if (phase === 'execution_choice') {
      return plan('cabin.help_gratin', 'Help Gratin get answers', 'Listen to Gratin');
    }
    if (phase === 'execution') {
      return plan(
        'cabin.finish_job',
        'Finish the job',
        this.executionChoice() === 'player'
          ? 'Use Gratin’s pistol on both prisoners'
          : 'Give Gratin room',
      );
    }
    if (phase === 'nightfall') {
      return plan('cabin.finish_job', 'Finish the job', 'Listen to Gratin');
    }
    if (phase === 'wrap_bodies') {
      if (!this.nightfallBriefingComplete()) {
        return plan('cabin.finish_job', 'Finish the job', 'Listen to Gratin');
      }
      const wrapped = Object.values(CABIN_HOSTAGE_IDS)
        .filter((id) => this.hostageState(id).wrapped).length;
      return plan('cabin.burn_bodies', 'Burn the bodies', `Wrap them up · ${wrapped}/2`);
    }
    if (phase === 'carry_bodies') {
      const delivered = Object.values(CABIN_HOSTAGE_IDS)
        .filter((id) => this.bodyAtFire(id)).length;
      return plan('cabin.burn_bodies', 'Burn the bodies', `Carry them to the fire · ${delivered}/2`);
    }
    if (phase === 'pour_gas') {
      return plan('cabin.burn_bodies', 'Burn the bodies', 'Soak the pyre with gasoline');
    }
    if (phase === 'ignite_bonfire') {
      return plan('cabin.burn_bodies', 'Burn the bodies', 'Light the pyre');
    }
    if (phase === 'fire_cleanup') {
      return plan('cabin.burn_bodies', 'Burn the bodies', 'Stay with the fire');
    }
    if (phase === 'drink') {
      return plan('cabin.fire_bonding', 'Sit with Lag and Gratin', 'Take the drink when it comes around');
    }
    if (phase === 'blackout') {
      return plan('cabin.fire_bonding', 'Sit with Lag and Gratin', 'Stay by the fire');
    }
    if (phase === 'morning_call') {
      return plan('cabin.answer_ape', 'Answer Ape’s call', 'Pick up the phone');
    }
    if (phase === 'morning_wake') {
      return plan('cabin.meet_ape', 'Meet Ape at the car', 'Head outside');
    }

    const door = this.tryLeave();
    if (door.kind === 'go') {
      return plan('cabin.depart', 'Take the car to Lou’s next job', 'Use the car when you are ready');
    }
    return plan('cabin.lay_low', 'Lay low at the cabin', door.line);
  }

  /** Player-facing objectives are deliberately singular. */
  objectives() {
    const current = this.objectivePlan();
    return [{
      id: current.id,
      label: current.label,
      step: current.step,
      done: false,
      required: true,
      current: true,
    }];
  }
}

export function createCountrysideCabinStory(options) {
  return new CountrysideCabinStory(options);
}
