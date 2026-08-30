/**
 * Durable story adapter for the countryside-cabin chapter.
 *
 * The page owns presentation. This module owns authored order, predicates and
 * exact-once campaign markers so every step can be resumed after a reload.
 * No extra save fields are needed: the existing time-event ledger is the
 * chapter state machine.
 */
import { EVENT_IDS, MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS } from './campaign.js';

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

  /* ------------------------------------------------------------------ *
   * VISIT ONE. Beats 4 and 5 of the spine.
   *
   * The Squatchfather ends near midnight and the same driver goes straight
   * out of the city, so the first thing that happens at this cabin is a bed.
   * He wakes on Day 2, Lou rings, he walks the four corners of the property,
   * Margo's number finally gets dialled, and then Booski rings about a
   * Captain who needs a hand nearby -- which is the Beef Run, and which is
   * what takes him off this property and back onto it the same night.
   * ------------------------------------------------------------------ */

  /** The sleep he does on arrival, before any of it. Wakes him 09:20, Day 2. */
  arrivalRestComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_LAY_LOW_REST);
  }

  completeArrivalRest() {
    return this.mark(TIME_EVENT_IDS.CABIN_LAY_LOW_REST);
  }

  openingCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL);
  }

  completeOpeningCall() {
    /* Legacy saves reached this call without an arrival rest and must keep
     * being able to finish the chapter, so this gates only forwards: a save
     * that has already answered Lou is never sent back to bed. */
    if (this.openingCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL);
    if (!this.arrivalRestComplete()) return this.blocked('arrival_rest_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL);
  }

  /** All four walks. The bible counts them, so this counts them. */
  propertyWalked() {
    return this.explorationCount() >= COUNTRYSIDE_CABIN_LANDMARKS.length;
  }

  /**
   * MARGO'S NUMBER, FINALLY DIALLED.
   *
   * She wrote it down at the Bing in beat 2 and he has been carrying it since.
   * This is the outgoing call and it is the only one at this cabin he makes
   * rather than answers -- which is the point of putting it after the walks,
   * with the property quiet and nobody to perform for.
   */
  margoCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL);
  }

  margoCallReady() {
    return this.openingCallComplete()
      && this.propertyWalked()
      && !this.margoCallComplete();
  }

  completeMargoCall() {
    if (this.margoCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL);
    if (!this.openingCallComplete()) return this.blocked('opening_call_incomplete');
    if (!this.propertyWalked()) return this.blocked('explore_first');
    return this.mark(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL, (state) => {
      state.events[EVENT_IDS.CABIN_MARGO_CALL].status = 'answered';
      /* `MARGO_DATE_CALL` is the legacy save key for "the date is scheduled."
       * The later incoming apartment call is retired, but its exact-once key
       * stays registered so old and new saves agree at the Silver Room gate. */
      state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
      /* And the setup line goes with it, so a save that reached the call
       * without hearing it is never handed it afterwards. */
      if (!state.story.timeEvents.includes(TIME_EVENT_IDS.CABIN_MARGO_READY)) {
        state.story.timeEvents.push(TIME_EVENT_IDS.CABIN_MARGO_READY);
      }
    });
  }

  /**
   * BOOSKI, ABOUT THE CAPTAIN. The end of visit one.
   *
   * This is the same beat the apartment used to play as `BOOSKI_DAY_TWO_CALL`
   * -- Booski authorising the Beef Run -- and `airstrip-story.js` still gates
   * `begin()` on that event, so the relocated call marks it. One story beat,
   * played somewhere else; not two calls that happen to be about a plane.
   */
  booskiSasoleCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL);
  }

  booskiSasoleCallReady() {
    return this.margoCallComplete() && !this.booskiSasoleCallComplete();
  }

  completeBooskiSasoleCall() {
    if (this.booskiSasoleCallComplete()) {
      return this.mark(TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL);
    }
    if (!this.margoCallComplete()) return this.blocked('margo_call_incomplete');
    return this.mark(TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL, (state) => {
      state.events[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL].status = 'answered';
      state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
      state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'available';
    });
  }

  /** Beat 5 is done and the aeroplane is what happens next. */
  visitOneComplete() {
    return this.booskiSasoleCallComplete();
  }

  /* ------------------------------------------------------------------ *
   * VISIT TWO. Beat 7, which is the dungeon.
   *
   * Sasole runs him back to the property he was picked up from rather than a
   * flat he is not supposed to be seen at. The clock ledger is exact-once by
   * id, so the return and the second night carry ids of their own -- reusing
   * the arrival's would find them already spent and advance nothing.
   * ------------------------------------------------------------------ */

  returnedFromAirstrip() {
    return this.has(TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP);
  }

  recordReturnFromAirstrip() {
    return this.mark(TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP);
  }

  /** The second night. Wakes him 08:10 on Day 3, which is the dungeon's day. */
  secondRestComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_SECOND_REST);
  }

  completeSecondRest() {
    return this.mark(TIME_EVENT_IDS.CABIN_SECOND_REST);
  }

  /**
   * The dungeon half may not start until he has come back and slept.
   *
   * Legacy saves are the exception, and deliberately: a save that already
   * answered Gratin under the old single-visit chapter has no
   * RETURN_CABIN_FROM_AIRSTRIP marker and never will, so it is let through
   * rather than wedged in a cabin it has already half-finished.
   */
  secondVisitReady() {
    if (this.gratinCallComplete()) return true;
    return this.secondRestComplete();
  }

  margoHookHandled() {
    return this.has(TIME_EVENT_IDS.CABIN_MARGO_READY);
  }

  /**
   * "Maybe I should give that girl from the bar a call."
   *
   * The one-line setup on the first walk, which is a different thing from the
   * call itself. It is spent once he has actually rung her -- a man who has
   * had the conversation does not then decide to have it.
   */
  margoReady() {
    return this.openingCallComplete()
      && this.explorationCount() >= 1
      && !this.margoHookHandled()
      && !this.margoCallComplete();
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

  /**
   * Gratin rings on the SECOND morning, not the first.
   *
   * It used to be "two walks and the Margo hook", which was the single-visit
   * chapter's own pacing. Under the spine the property walk, Margo and Booski
   * are Day 2 and the cellar is Day 3, with a flight and a night in between.
   */
  gratinCallReady() {
    return this.openingCallComplete()
      && this.secondVisitReady()
      && !this.gratinCallComplete();
  }

  completeGratinCall() {
    if (this.gratinCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_GRATIN_CALL);
    if (!this.openingCallComplete()) return this.blocked('opening_call_incomplete');
    if (!this.secondVisitReady()) return this.blocked('second_visit_not_ready');
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

    /* The current route reaches this beat on Day 3, where the canonical time
     * event anchors it at 20:45. Post-heist saves and the standalone Cabin
     * preview can legitimately arrive on a later date, though, and an
     * `atLeast: Day 3` event cannot move Day 7 from noon to night: absolute
     * time is already greater than the fixed anchor. Bring only those later
     * calendars forward to the same day's 20:45 before spending the exact-once
     * event. Never move a late-running playthrough backwards. */
    const before = this.campaign.state.story;
    let compatibilityMinutes = 0;
    const nightfallMinute = 20 * 60 + 45;
    if (before.day > 3 && before.timeMinutes < nightfallMinute) {
      compatibilityMinutes = nightfallMinute - before.timeMinutes;
      this.campaign.update((state) => {
        state.story.timeMinutes = nightfallMinute;
      });
    }
    const result = this.mark(TIME_EVENT_IDS.CABIN_NIGHTFALL);
    return compatibilityMinutes > 0
      ? { ...result, minutesAdvanced: result.minutesAdvanced + compatibilityMinutes }
      : result;
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

    /* Same compatibility rule as nightfall, but this transition owns the
     * next morning. The fixed Day-4 anchor serves the current route. A later
     * legacy calendar advances to its next 09:30 instead of remaining beside
     * the fire because its absolute timestamp already outranks Day 4. */
    const before = this.campaign.state.story;
    let compatibilityMinutes = 0;
    const wakeMinute = 9 * 60 + 30;
    const fixedWakeAbsolute = (4 - 1) * 24 * 60 + wakeMinute;
    const beforeAbsolute = (before.day - 1) * 24 * 60 + before.timeMinutes;
    if (beforeAbsolute >= fixedWakeAbsolute) {
      const wakeDay = before.timeMinutes < wakeMinute ? before.day : before.day + 1;
      const wakeAbsolute = (wakeDay - 1) * 24 * 60 + wakeMinute;
      compatibilityMinutes = wakeAbsolute - beforeAbsolute;
      this.campaign.update((state) => {
        state.story.day = wakeDay;
        state.story.timeMinutes = wakeMinute;
      });
    }
    const result = this.mark(TIME_EVENT_IDS.CABIN_BLACKOUT, (state) => {
      state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'wake' };
    });
    return compatibilityMinutes > 0
      ? { ...result, minutesAdvanced: result.minutesAdvanced + compatibilityMinutes }
      : result;
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

  /**
   * BOOSKI, ABOUT BILLY. The end of beat 7 and the end of this cabin.
   *
   * The bible: *"Then Booski: Billy is getting out, come back to the Bing."*
   * It is the same summons the apartment used to play as `LOU_SECOND_CALL` on
   * Day 2, so the relocated call marks that event too -- otherwise a man
   * walking back into his own flat two missions later would be rung about a
   * party he has already been to.
   */
  billyCallComplete() {
    return this.has(TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL);
  }

  /**
   * Compatibility saves entered this scene after the bank, when Silver Case
   * was already the next mission. They leave after the morning wake and must
   * never receive the Act-One call about Billy on their way to the final arc.
   */
  legacySilverCaseRoute() {
    const status = this.campaign.state.missions[MISSION_IDS.SILVER_CASE]?.status;
    return status === 'available' || status === 'in_progress';
  }

  billyCallReady() {
    return !this.legacySilverCaseRoute()
      && this.blackedOut()
      && !this.billyCallComplete();
  }

  completeBillyCall() {
    if (this.billyCallComplete()) return this.mark(TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL);
    if (this.legacySilverCaseRoute()) return this.blocked('legacy_silver_case_route');
    if (!this.blackedOut()) return this.blocked('morning_not_reached');
    return this.mark(TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL, (state) => {
      /* Fresh Act One has one morning call. Retain the retired Ape markers in
       * the same exact-once mutation, without charging their old three-minute
       * clock cost, so older saves and callers normalize to the same shape. */
      for (const legacyId of [
        TIME_EVENT_IDS.CABIN_MORNING_CALL,
        TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE,
      ]) {
        if (!state.story.timeEvents.includes(legacyId)) state.story.timeEvents.push(legacyId);
      }
      state.events[EVENT_IDS.CABIN_BILLY_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
      state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
      /* AND THE CHAPTER TURNS HERE, ON A COUNTY ROAD, NOT IN HIS OWN BED.
       *
       * `day_two` is the apartment's name for exactly this stretch -- the
       * second Bing visit, the burial, the motel -- and both of the calls that
       * used to open it have just been answered on this porch. Without this
       * he drives to the Bing still in `day_one`, and the first time he lies
       * down at home the chapter machine hands him a Tuesday he already had. */
      state.story.chapter = 'day_two';
    });
  }

  chapterComplete() {
    return this.legacySilverCaseRoute()
      ? this.morningWakeComplete()
      : this.billyCallComplete();
  }

  phase() {
    /* VISIT ONE. */
    if (!this.arrivalRestComplete() && !this.openingCallComplete()) return 'arrival_rest';
    if (!this.openingCallComplete()) return 'opening_call';
    if (!this.gratinCallComplete()) {
      if (!this.propertyWalked()) return 'explore';
      if (!this.margoCallComplete()) return 'margo_call';
      if (!this.booskiSasoleCallComplete()) return 'booski_call';
      /* Beat 6 happens somewhere else. Until the aeroplane is down and he has
       * been driven back, this cabin has nothing left to offer him. */
      if (!this.airstripComplete()) return 'beef_run';
      if (!this.returnedFromAirstrip()) return 'return_to_cabin';
      if (!this.secondRestComplete()) return 'second_rest';
      return 'gratin_call';
    }
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
    /* Retired post-heist saves still finish their already-authored Ape wake.
     * Fresh Act One skips those phases and receives one Booski/Billy call. */
    if (this.legacySilverCaseRoute()) {
      if (!this.morningCallComplete()) return 'morning_call';
      if (!this.morningWakeComplete()) return 'morning_wake';
      return 'complete';
    }
    if (!this.billyCallComplete()) return 'billy_call';
    return 'complete';
  }

  /** Beat 6, asked of the campaign rather than of this chapter's ledger. */
  airstripComplete() {
    return this.campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status === 'complete';
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

  /**
   * THE CAR, AND THE TWO TIMES IT IS ALLOWED TO MOVE.
   *
   * The cabin is one Act-One scene that the Beef Run cuts in half, so this
   * door opens exactly twice: once at the end of visit one, for the airstrip,
   * and once at the end of beat 7, for the Bing. Everything between is a man
   * who was told to stay put.
   *
   * The legacy branch below is not decoration. `SILVER_CASE` was this scene's
   * only exit while the cabin was a post-heist lay-low, and a save parked in
   * that chapter has no route to the last third of the game without it.
   * CLAUDE.md: add first, remove last.
   */
  tryLeave() {
    const missions = this.campaign.state.missions;
    const silverCase = missions[MISSION_IDS.SILVER_CASE];

    /* LEGACY: a save that got here the old way, after the bank. */
    if (this.legacySilverCaseRoute()) {
      if (!this.morningWakeComplete()) {
        return {
          kind: 'stay',
          id: 'cabin_chapter_incomplete',
          line: 'The car stays where it is until the work below is finished and morning comes.',
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

    /* BEAT 7'S EXIT. Booski has rung about Billy and the Bing is expecting him. */
    if (this.chapterComplete()) {
      return { kind: 'go', destination: SCENE_IDS.BADA_BING_TWO };
    }

    /* BEAT 5'S EXIT. Booski has rung about the Captain and there is a plane. */
    if (this.visitOneComplete() && !this.airstripComplete()) {
      return { kind: 'go', destination: SCENE_IDS.AIRSTRIP_SMUGGLING };
    }

    if (!this.visitOneComplete()) {
      return {
        kind: 'stay',
        id: 'cabin_wait',
        line: 'Lou said stay put. The road can wait until the phone says otherwise.',
      };
    }
    return {
      kind: 'stay',
      id: 'cabin_chapter_incomplete',
      line: 'The car stays where it is until the work below is finished and morning comes.',
    };
  }

  /** Full durable chapter ledger for debug, save auditing, and QA tools. */
  objectiveLedger() {
    const dungeonPrimary = this.dungeonPrimary();
    const explored = new Set(this.explored().map(({ id }) => id));
    const out = [
      /* THE FIRST THING THAT HAPPENS HERE IS A BED. It was not on the list at
       * all, so a player who got out of the car at 05:20 was shown a call he
       * could not answer and nothing he could. */
      {
        id: TIME_EVENT_IDS.CABIN_LAY_LOW_REST,
        label: 'Get some sleep',
        done: this.arrivalRestComplete(),
        required: true,
        pending: this.openingCallComplete(),
        retire: true,
      },
      {
        id: TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL,
        label: 'Answer Lou’s call',
        done: this.openingCallComplete(),
        required: true,
        /* Owner: *"hide the objective that is answer lous call and display it
         * only as he calls."* He arrives at five in the morning and sleeps;
         * Lou rings at 09:20. Listing the call before it happens names a
         * thing the player cannot do and then leaves it sitting there
         * unticked, reading as something he has failed to do. */
        pending: !this.arrivalRestComplete() && !this.openingCallComplete(),
        retire: true,
      },
      /* The walks retire one at a time. Four ticked lines that cannot be
       * un-ticked are four lines of nothing, and they push the thing he is
       * actually meant to do next off the bottom of a short panel. */
      /* The walks are not offered until Lou has rung, because `visit()`
       * refuses them until then -- a list that asks for something the code
       * will refuse is the same fault as Lou's own line, four times over. */
      ...COUNTRYSIDE_CABIN_LANDMARKS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        done: explored.has(entry.id),
        required: !dungeonPrimary,
        pending: !this.openingCallComplete(),
        retire: true,
      })),
    ];

    /* VISIT ONE's own list, which only exists until the cellar does. */
    if (!dungeonPrimary) {
      out.push({
        id: TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL,
        label: 'Call the number Margo wrote down',
        done: this.margoCallComplete(),
        required: true,
        /* `completeMargoCall` returns `explore_first` until all four corners
         * are walked, so until then this is a row he cannot act on. */
        pending: !this.propertyWalked(),
        retire: true,
      });
      if (this.margoCallComplete() || this.booskiSasoleCallComplete()) {
        out.push({
          id: TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL,
          label: 'Answer Booskibro about Captain Sasole',
          done: this.booskiSasoleCallComplete(),
          required: true,
          retire: true,
        });
      }
      if (this.booskiSasoleCallComplete()) {
        out.push({
          id: MISSION_IDS.AIRSTRIP_SMUGGLING,
          label: 'Fly the beef run with Captain Sasole',
          done: this.airstripComplete(),
          required: true,
        });
      }
      if (this.airstripComplete()) {
        out.push({
          id: TIME_EVENT_IDS.CABIN_SECOND_REST,
          label: 'Sleep it off back at the cabin',
          done: this.secondRestComplete(),
          required: true,
        });
      }
    }

    if (this.secondVisitReady() || this.gratinCallComplete()) {
      out.push({
        id: TIME_EVENT_IDS.CABIN_GRATIN_CALL,
        label: 'Answer Gratin’s call',
        done: this.gratinCallComplete(),
        required: true,
      });
    }

    if (dungeonPrimary) {
      const counterStrike = this.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
      const ateam = this.hostageState(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
      out.push(
        {
          id: TIME_EVENT_IDS.CABIN_CELLAR_OPEN,
          label: 'Open the hidden cellar door',
          done: this.cellarOpen(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_DUNGEON_ENTERED,
          label: 'Enter the dungeon',
          done: this.dungeonEntered(),
          required: true,
        },
        {
          id: 'interrogate.counter_strike_player',
          label: `Interrogate the Counter-Strike baiter (${Math.min(counterStrike.hits, counterStrike.threshold)}/${counterStrike.threshold})`,
          done: counterStrike.interrogationReady,
          required: true,
        },
        {
          id: 'interrogate.ateam_member',
          label: `Interrogate the A-Team member (${Math.min(ateam.hits, ateam.threshold)}/${ateam.threshold})`,
          done: ateam.interrogationReady,
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_ATEAM_INTEL_LEARNED,
          label: 'Learn what the A-Team member knows',
          done: this.ateamIntelLearned(),
          required: true,
        },
        {
          id: 'execution.countryside_cabin',
          label: 'Settle who carries out the executions',
          done: Boolean(this.executionChoice()),
          required: true,
        },
        {
          id: 'deaths.countryside_cabin',
          label: 'Finish the two prisoners',
          done: this.deathsComplete(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_NIGHTFALL,
          label: 'Wait for nightfall',
          done: this.nightfallComplete(),
          required: true,
        },
        {
          id: 'wrap.countryside_cabin',
          label: 'Wrap both bodies',
          done: this.wrappingComplete(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_AT_FIRE,
          label: 'Carry the Counter-Strike player to the fire',
          done: this.bodyAtFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_ATEAM_AT_FIRE,
          label: 'Carry the A-Team member to the fire',
          done: this.bodyAtFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_GAS_POURED,
          label: 'Pour gasoline over the bodies',
          done: this.gasPoured(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_BONFIRE_IGNITED,
          label: 'Ignite the bonfire',
          done: this.bonfireIgnited(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_FIRE_CLEANUP,
          label: 'Burn the evidence and clear the dungeon',
          done: this.fireCleanupComplete(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_DRINK,
          label: 'Have a drink by the fire',
          done: this.drankAfterCleanup(),
          required: true,
        },
        {
          id: TIME_EVENT_IDS.CABIN_BLACKOUT,
          label: 'Let the night go dark',
          done: this.blackedOut(),
          required: true,
        },
      );
      if (this.legacySilverCaseRoute()) {
        out.push(
          {
            id: TIME_EVENT_IDS.CABIN_MORNING_CALL,
            label: 'Answer the morning call',
            done: this.morningCallComplete(),
            required: true,
          },
          {
            id: TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE,
            label: 'Get ready to leave the cabin',
            done: this.morningWakeComplete(),
            required: true,
          },
        );
      } else if (this.blackedOut() || this.billyCallComplete()) {
        out.push({
          id: TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL,
          label: 'Answer Booskibro about Billy Hotdog',
          done: this.billyCallComplete(),
          required: true,
        });
      }
    }

    /* The door names where it is actually going, because it opens twice. */
    const door = this.tryLeave();
    const DEPARTURE_LABELS = {
      [SCENE_IDS.AIRSTRIP_SMUGGLING]: 'Ride out to the airstrip',
      [SCENE_IDS.BADA_BING_TWO]: 'Drive back to the Bing',
      [SCENE_IDS.SILVER_CASE]: 'Take the car to Lou’s next job',
    };
    /* AND IT SAYS NOTHING WHEN IT IS SHUT.
     *
     * Owner: *"Remove the finish the Cabin chapter from objectives what does
     * that even mean."* He is right -- it was the panel describing the panel.
     * The car is either a thing he can get into or it is not part of the
     * list, and every other line here already says what to do next. */
    if (door.kind === 'go') {
      out.push({
        id: `depart.${door.destination}`,
        label: DEPARTURE_LABELS[door.destination] ?? 'Take the car',
        done: false,
        required: true,
      });
    }
    return out;
  }

  /**
   * One spoiler-safe standing order and, at most, one immediate soft step.
   *
   * The ledger above is durable story truth, not a player-facing checklist.
   * This projection keeps future calls, the dungeon, the executions, and the
   * cleanup sequence hidden until the player can actually act on them.
   */
  objectivePlan() {
    const phase = this.phase();
    const plan = (id, label, step) => Object.freeze({ id, label, step });

    if (phase === 'arrival_rest') {
      return plan('cabin.settle_in', 'Settle in at the cabin', 'Get some sleep');
    }
    if (phase === 'opening_call') {
      return plan('cabin.lay_low', 'Lay low at the cabin', 'Answer Lou’s call');
    }
    if (phase === 'explore') {
      return plan(
        'cabin.explore',
        'Explore the property',
        `${Math.min(this.explorationCount(), COUNTRYSIDE_CABIN_LANDMARKS.length)}/${COUNTRYSIDE_CABIN_LANDMARKS.length} places visited`,
      );
    }
    if (phase === 'margo_call') {
      return plan('cabin.call_margo', 'Call Margo', 'Use the number from the Bing');
    }
    if (phase === 'booski_call') {
      return plan('cabin.answer_booski', 'Answer Booskibro’s call', 'Pick up the phone');
    }
    if (phase === 'beef_run') {
      return plan('cabin.depart_airstrip', 'Ride out to the airstrip', 'Take the car');
    }
    if (phase === 'return_to_cabin') {
      return plan('cabin.return', 'Return to the cabin', 'Head back to the hideout');
    }
    if (phase === 'second_rest') {
      return plan('cabin.second_rest', 'Get some sleep', 'Use the cabin bed');
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
      return plan('cabin.morning', 'Get ready to leave', 'Head outside');
    }
    if (phase === 'billy_call') {
      return plan('cabin.answer_booski', 'Answer Booskibro’s call', 'Pick up the phone');
    }

    const door = this.tryLeave();
    const departureLabels = {
      [SCENE_IDS.AIRSTRIP_SMUGGLING]: 'Ride out to the airstrip',
      [SCENE_IDS.BADA_BING_TWO]: 'Drive back to the Bing',
      [SCENE_IDS.SILVER_CASE]: 'Take the car to Lou’s next job',
    };
    if (door.kind === 'go') {
      return plan(
        `depart.${door.destination}`,
        departureLabels[door.destination] ?? 'Take the car to Lou’s next job',
        'Use the car when you are ready',
      );
    }
    return plan(`cabin.${door.id}`, 'Stay at the cabin', door.line);
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
