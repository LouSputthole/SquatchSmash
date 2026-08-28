import {
  CABIN_HOSTAGE_IDS,
} from '../core/countryside-cabin-story.js';
import { CABIN_PHONE_CALLS, MARGO_CALL_READY } from './script.js';

export const DUNGEON_TO_STORY_HOSTAGE = Object.freeze({
  counterStrike: CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
  counterstrike: CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
  'counterstrike-player': CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
  counter_strike_player: CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
  ateam: CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
  'a-team-member': CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
  ateam_member: CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
});

export const STORY_TO_CLEANUP_BODY = Object.freeze({
  [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: 'counterstrike-player',
  [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: 'a-team-member',
});

/**
 * One authored feel profile per tangible table tool.
 *
 * The cue/rate pairs intentionally reuse recordings already in the shared
 * manifest; no Cabin-local audio framework or generated asset is needed. The
 * runtime owns duration so a second interaction cannot land while the first
 * visible tool motion and impact are still resolving.
 */
export const CABIN_TORTURE_TOOL_PROFILES = Object.freeze({
  pliers: Object.freeze({ duration: 0.48, flinch: 0.58, cue: 'punch.light', rate: 1.34, volume: 0.44 }),
  saw: Object.freeze({ duration: 0.72, flinch: 0.82, cue: 'swing.whiff', rate: 0.84, volume: 0.50 }),
  battery: Object.freeze({ duration: 0.78, flinch: 1.00, cue: 'stunprod.arc', rate: 0.96, volume: 0.58 }),
  syringes: Object.freeze({ duration: 0.42, flinch: 0.44, cue: 'switch.click', rate: 1.62, volume: 0.38 }),
  towels: Object.freeze({ duration: 0.62, flinch: 0.68, cue: 'cloth.snap', rate: 0.82, volume: 0.48 }),
  leads: Object.freeze({ duration: 0.70, flinch: 0.90, cue: 'stunprod.arc', rate: 0.72, volume: 0.55 }),
  bucket: Object.freeze({ duration: 0.68, flinch: 0.94, cue: 'punch.heavy', rate: 0.74, volume: 0.55 }),
});

const CLEANUP_TO_STORY_BODY = Object.freeze(Object.fromEntries(
  Object.entries(STORY_TO_CLEANUP_BODY).map(([storyId, cleanupId]) => [cleanupId, storyId]),
));

const FIRE_BEATS = Object.freeze([
  'FIRE_TALK_ONE',
  'FIRE_TALK_SQUATCHES',
  'FIRE_TALK_TWO',
  'FIRE_TALK_THREE',
  'BLACKOUT',
]);

const RETURN_TO_CABIN_DISTANCE = 30;

function storyHostageId(id) {
  if (Object.values(CABIN_HOSTAGE_IDS).includes(id)) return id;
  return DUNGEON_TO_STORY_HOSTAGE[id] || CLEANUP_TO_STORY_BODY[id] || null;
}

/**
 * Runtime orchestration for the Cabin chapter.
 *
 * Campaign truth remains in CountrysideCabinStory. This adapter sequences the
 * phone, dialogue, choice clock and presentation callbacks around that truth.
 * No wall-clock timeout is used: pausing freezes calls-to-retry, Gratin's two
 * execution shots, the forty-second clue and every authored choice.
 */
export class CabinChapterRuntime {
  constructor({
    story,
    phone,
    dialogue,
    choice,
    hud = null,
    callbacks = {},
  } = {}) {
    if (!story || !phone || !dialogue || !choice) {
      throw new TypeError('CabinChapterRuntime requires story, phone, dialogue and choice');
    }
    this.story = story;
    this.phone = phone;
    this.dialogue = dialogue;
    this.choice = choice;
    this.hud = hud;
    this.callbacks = callbacks;
    this.active = false;
    this.callRetry = 0;
    this.currentCallId = null;
    this.beatQueue = [];
    this.selectedTool = null;
    this.toolUseRemaining = 0;
    this.toolsIntroduced = false;
    this.searchSeconds = 0;
    this.searchHintPlayed = false;
    this.executionClock = null;
    this.firstWrapLinePlayed = false;
    this.firstFireLinePlayed = false;
    this.bodyCarryReady = false;
    this.castAtFire = false;
    this.fireSequenceStarted = false;
    this.intoxication = 0;
    this.pendingConsume = null;
    this._revealingIntel = false;
    this._deathTransitioned = false;
    this._suppressCallEnd = false;
    this._blackoutFinished = false;
    this._blackoutTransitionPending = false;
    this._margoSetupPending = false;
    this._returnLinePending = false;
    this._executionBranchPending = false;
    this._gratinAftermathPending = false;

    const priorCallState = this.phone.onCallState;
    this.phone.onCallState = (connected, definition) => {
      priorCallState?.(connected, definition);
      if (!connected) this._callEnded(definition);
    };
    const priorAnswered = this.phone.onAnswered;
    this.phone.onAnswered = (definition) => {
      priorAnswered?.(definition);
      this.currentCallId = definition?.id || null;
      this.callbacks.onCallAnswered?.(definition);
    };

    const priorChoice = this.choice.onResolve;
    this.choice.onResolve = (result, reason) => {
      priorChoice?.(result, reason);
      this.resolveExecutionChoice(result, reason);
    };

    const priorAction = this.dialogue.onAction;
    this.dialogue.onAction = (entry, resume, beatId) => {
      if (entry.action === 'execution-choice') {
        this.choice.open();
        this.callbacks.onChoiceOpen?.(entry);
      } else if (['drink-beer', 'drink-whiskey', 'smoke'].includes(entry.action)) {
        const item = entry.action === 'drink-beer'
          ? 'beer' : entry.action === 'drink-whiskey' ? 'whiskey' : 'cigs';
        this.pendingConsume = { action: entry.action, item, optional: entry.optional === true };
        const accepted = this.callbacks.onConsumeRequest?.(item, entry, beatId);
        if (accepted === false && entry.optional) {
          this.pendingConsume = null;
          resume();
        }
      } else {
        priorAction?.(entry, resume, beatId);
      }
    };
  }

  start() {
    if (this.active) return this.story.phase();
    this.active = true;
    this.callbacks.onSync?.();
    this._restorePhase();
    return this.story.phase();
  }

  stop() {
    this.active = false;
    /* Teardown is not an authored hang-up. In particular, leaving/reloading
     * while a call is connected must not award its durable completion marker. */
    this._suppressCallEnd = true;
    this.phone.hangUp?.({ force: true });
    this._suppressCallEnd = false;
    this.dialogue.stop?.();
    this.choice.close?.();
    this.beatQueue.length = 0;
    this.executionClock = null;
    this.returnTool('stop');
    this.pendingConsume = null;
    this._margoSetupPending = false;
    this._returnLinePending = false;
    this._revealingIntel = false;
    this._executionBranchPending = false;
    this._gratinAftermathPending = false;
    this._deathTransitioned = false;
  }

  _restorePhase() {
    const phase = this.story.phase();
    if (phase !== 'interrogation') this.returnTool('restore');
    if (this.story.nightfallComplete()) {
      this.callbacks.onNightfall?.({ restored: true });
      if (phase === 'wrap_bodies' && !this.story.nightfallBriefingComplete()) {
        this._completeDeathTransition({ restored: true });
      }
    }
    this.callbacks.onRestore?.(phase);
    /* A save can land between any two presentation frames. Restore every
     * page-local bridge from durable story truth instead of expecting the
     * player to repeat the interaction which originally created it. */
    this._emitMargoReady({ restored: true });
    if (this.story.dungeonEntered()) this.callbacks.onDungeonDoorOpen?.({ restored: true });
    if (this.story.wrappingComplete()) this.bodyCarryReady = true;
    if (this.story.bodiesAtFire()) this._moveCastToFire({ restored: true });
    if (this.story.gasPoured()) this.callbacks.onPourGas?.({ restored: true });
    if (this.story.bonfireIgnited()) this.callbacks.onIgniteBonfire?.({ restored: true });

    if (phase === 'ateam_intel') {
      this._beginIntelReveal();
    } else if (phase === 'execution_choice') {
      this._beginExecutionOffer();
    } else if (phase === 'execution') {
      if (!this.story.executionBranchVoComplete()) {
        this._resumeExecutionBranch({ restored: true });
      } else if (this.story.executionChoice() === 'player') {
        this.callbacks.onEquipPistol?.({ restored: true });
      } else {
        this._beginGratinExecution({ restored: true });
      }
    } else if (phase === 'nightfall') {
      if (this.story.executionChoice() === 'gratin') {
        this._queueGratinAftermath({ restored: true });
      } else {
        this._completeDeathTransition();
      }
    } else if (phase === 'fire_cleanup') {
      this._resumeIgnitedFire();
    } else if (phase === 'drink' || phase === 'blackout') {
      if (this.story.drankAfterCleanup()) this.intoxication = Math.max(this.intoxication, 0.2);
      this._startFireSequence({ restored: true });
    } else if (phase === 'morning_call') {
      this._restoreMorning();
    } else if (phase === 'morning_wake') {
      this.callbacks.onWakeMorning?.({ restored: true });
      this.story.completeMorningWake();
      this.callbacks.onSync?.();
    } else if (phase === 'billy_call') {
      /* Fresh Act One wakes into the single canonical Booski/Billy call. */
      this._restoreMorning();
    } else if (phase === 'complete') {
      this.callbacks.onWakeMorning?.({ restored: true });
      this.callbacks.onChapterComplete?.({ restored: true });
    }
  }

  queueBeat(id, onDone = null, { front = false } = {}) {
    if (!id) return false;
    const entry = { id, onDone };
    if (front) this.beatQueue.unshift(entry);
    else this.beatQueue.push(entry);
    this._pumpBeat();
    return true;
  }

  _pumpBeat() {
    if (this.dialogue.running || !this.beatQueue.length) return;
    const next = this.beatQueue.shift();
    this.dialogue.play(next.id, {
      onDone: () => {
        next.onDone?.();
        this._pumpBeat();
      },
    });
  }

  _ring(definition) {
    if (!definition || this.phone.call) return false;
    this.callbacks.ensurePhone?.(definition);
    const rang = this.phone.ring(definition);
    if (rang) {
      this.currentCallId = definition.id;
      this.callRetry = 0;
      this.callbacks.onCallRinging?.(definition);
    }
    return rang;
  }

  /**
   * Tony deliberately calls Margo from the held handset.
   *
   * This is not part of the incoming-call scheduler: the objective waits on
   * the real player phone interaction, and `Phone.startOutgoing` supplies no
   * ringtone or decline state. The durable date marker is still awarded only
   * when the authored conversation ends naturally in `_callEnded`.
   */
  startMargoCall() {
    const definition = CABIN_PHONE_CALLS.MARGO_FIRST_CALL;
    if (!this.active || this.phone.call || !this.story.margoCallReady()) return false;
    this.callbacks.ensurePhone?.(definition);
    const started = this.phone.startOutgoing?.(definition) === true;
    if (!started) return false;
    this.currentCallId = definition.id;
    this.callRetry = 0;
    this.callbacks.onCallOutgoing?.(definition);
    return true;
  }

  _callEnded(definition) {
    if (this._suppressCallEnd || !this.active) return;
    const id = definition?.id;
    if (id === CABIN_PHONE_CALLS.LOU_ARRIVAL.id) {
      this.story.completeOpeningCall();
    } else if (id === CABIN_PHONE_CALLS.MARGO_FIRST_CALL.id) {
      this.story.completeMargoCall();
    } else if (id === CABIN_PHONE_CALLS.BOOSKI_SASOLE.id) {
      this.story.completeBooskiSasoleCall();
      /* Beat 5 is over the moment he hangs up: the car is unlocked and the
       * strip is forty minutes away. The page reads `tryLeave` for the rest. */
      this.callbacks.onVisitOneComplete?.();
    } else if (id === CABIN_PHONE_CALLS.GRATIN_BASEMENT.id) {
      const result = this.story.completeGratinCall();
      if (result.ok) {
        this.searchSeconds = 0;
        this.searchHintPlayed = false;
      }
    } else if (id === CABIN_PHONE_CALLS.APE_MORNING.id) {
      /* Compatibility only: retired post-heist saves can still owe Ape's old
       * wake gate. Fresh Act One never rings this definition. */
      this.story.completeMorningCall();
      this.story.completeMorningWake();
    } else if (id === CABIN_PHONE_CALLS.BOOSKI_BILLY.id) {
      this.story.completeBillyCall();
      this.callbacks.onChapterComplete?.();
    }
    this.currentCallId = null;
    this.callRetry = 1.5;
    this.callbacks.onSync?.();
  }

  /**
   * THE PHONE, IN THE ORDER THE BIBLE RINGS IT.
   *
   * Lou when he wakes up. Tony places Margo's call from the objective after
   * he has walked all four corners. Booski about the Captain ends visit one. Gratin on the
   * second morning, which starts the dungeon. Booski about Billy after the
   * blackout, which owns the wake-up and ends the chapter. Ape is retained
   * only for retired post-heist saves already parked in his old wake phase.
   *
   * Nothing rings before the bed: the opening call gate is
   * `arrivalRestComplete`, and ringing at half five in the morning to tell a
   * man to relax is the one joke this scene must not make.
   */
  _updateCalls(dt) {
    if (this.phone.call) return;
    this.callRetry = Math.max(0, this.callRetry - dt);
    if (this.callRetry > 0) return;
    if (!this.story.arrivalRestComplete() && !this.story.openingCallComplete()) return;
    if (!this.story.openingCallComplete()) {
      if (!this._ring(CABIN_PHONE_CALLS.LOU_ARRIVAL)) this.callRetry = 2;
      return;
    }
    if (this.story.booskiSasoleCallReady()) {
      if (!this._ring(CABIN_PHONE_CALLS.BOOSKI_SASOLE)) this.callRetry = 2;
      return;
    }
    if (this.story.gratinCallReady()) {
      if (!this._ring(CABIN_PHONE_CALLS.GRATIN_BASEMENT)) this.callRetry = 2;
      return;
    }
    if (this.story.blackedOut()
      && !this._blackoutTransitionPending
      && this.story.legacySilverCaseRoute()
      && !this.story.morningCallComplete()) {
      if (!this._ring(CABIN_PHONE_CALLS.APE_MORNING)) this.callRetry = 2;
      return;
    }
    if (!this._blackoutTransitionPending && this.story.billyCallReady()) {
      if (!this._ring(CABIN_PHONE_CALLS.BOOSKI_BILLY)) this.callRetry = 2;
    }
  }

  update(dt, {
    playerPosition = null,
    cabinPosition = { x: 0, z: 0 },
  } = {}) {
    if (!this.active) return this.snapshot();
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    this.toolUseRemaining = Math.max(0, this.toolUseRemaining - step);
    this.dialogue.update(step);
    this.choice.update(step);
    this._updateCalls(step);
    this._updateExecution(step);
    this._updateSearchHint(step, playerPosition, cabinPosition);
    if (this.story.interrogationComplete() && !this.story.ateamIntelLearned()) {
      this._beginIntelReveal();
    }
    if (this.story.deathsComplete() && !this.story.nightfallComplete()) {
      if (this.story.executionChoice() === 'gratin') {
        if (!this.executionClock) this._queueGratinAftermath();
      } else {
        this._completeDeathTransition();
      }
    }
    this._pumpBeat();
    return this.snapshot();
  }

  _updateSearchHint(dt, position, cabinPosition) {
    if (!position || !this.story.basementVisible() || this.story.cellarOpen()) return;
    const distance = Math.hypot(
      position.x - (cabinPosition?.x || 0),
      position.z - (cabinPosition?.z || 0),
    );
    this._queueReturnToCabinLine(distance);
    if (!this.story.returnToCabinLineComplete() || this.searchHintPlayed || distance > 15) return;
    this.searchSeconds += dt;
    if (this.searchSeconds < 40) return;
    this.searchHintPlayed = true;
    this.queueBeat('SUPREME_LEADER_HINT');
  }

  _queueReturnToCabinLine(distance) {
    if (distance > RETURN_TO_CABIN_DISTANCE
      || this._returnLinePending
      || this.story.returnToCabinLineComplete()) return false;
    this._returnLinePending = true;
    this.queueBeat('RETURN_TO_CABIN', () => {
      this._returnLinePending = false;
      this.story.completeReturnToCabinLine();
      this.callbacks.onSync?.();
    });
    return true;
  }

  notifyLandmark(result) {
    if (!result?.ok || !result.firstVisit) return false;
    this._emitMargoReady();
    this.callbacks.onSync?.();
    this.callRetry = 0;
    return true;
  }

  _emitMargoReady({ restored = false } = {}) {
    if (this._margoSetupPending || !this.story.margoReady()) return false;
    this._margoSetupPending = true;
    this.queueBeat('FIRST_EXPLORATION', () => {
      this._margoSetupPending = false;
      const result = this.story.consumeMargoReady();
      if (!result.ok || !result.firstTime) return;
      this.callbacks.onMargoReady?.({
        eventName: MARGO_CALL_READY.eventName,
        story: this.story,
        phone: this.phone,
        restored,
      });
      this.callbacks.onSync?.();
      this.callRetry = 0;
    });
    return true;
  }

  canRevealBasement() {
    return this.story.basementVisible();
  }

  openCellar() {
    const result = this.story.openCellar();
    if (!result.ok) return result;
    if (result.firstTime) this.queueBeat('CELLAR_DISCOVERY');
    this.callbacks.onSync?.();
    return result;
  }

  enterDungeon() {
    const result = this.story.enterDungeon();
    if (!result.ok) return result;
    this.callbacks.onDungeonDoorOpen?.();
    if (result.firstTime) {
      this.queueBeat('DUNGEON_DOOR');
      this.queueBeat('DUNGEON_INTRO');
    }
    this.callbacks.onSync?.();
    return result;
  }

  introduceTools() {
    if (this.toolsIntroduced) return false;
    this.toolsIntroduced = true;
    this.queueBeat('TOOLS');
    return true;
  }

  selectTool(id) {
    if (id !== null && id !== undefined && !CABIN_TORTURE_TOOL_PROFILES[id]) return null;
    const next = id && id !== this.selectedTool ? id : null;
    this.selectedTool = next;
    this.toolUseRemaining = 0;
    this.introduceTools();
    this.callbacks.onToolSelected?.(this.selectedTool);
    return this.selectedTool;
  }

  returnTool(reason = 'player') {
    const prior = this.selectedTool;
    this.selectedTool = null;
    this.toolUseRemaining = 0;
    if (prior) this.callbacks.onToolSelected?.(null, { prior, reason });
    return prior;
  }

  canTorture() {
    return this.story.phase() === 'interrogation'
      && !this.dialogue.running
      && !this.choice.active
      && this.toolUseRemaining <= 0;
  }

  torture(id) {
    const hostageId = storyHostageId(id);
    if (!hostageId) return { ok: false, reason: 'unknown_hostage' };
    if (!this.selectedTool) {
      this.hud?.toast?.('Pick a tool from Gratin’s table first');
      this.introduceTools();
      return { ok: false, reason: 'tool_required' };
    }
    if (this.toolUseRemaining > 0) return { ok: false, reason: 'tool_busy' };
    if (!this.canTorture()) return { ok: false, reason: 'interrogation_busy' };
    const result = this.story.hitHostage(hostageId);
    if (!result.ok || !result.applied) return result;
    const profile = CABIN_TORTURE_TOOL_PROFILES[this.selectedTool];
    this.toolUseRemaining = profile.duration;
    this.callbacks.onTortureHit?.(hostageId, result.hostage, this.selectedTool, profile);
    const hits = result.hostage.hits;
    if (hostageId === CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER) {
      this.queueBeat(hits === 1 ? 'BAITER_FIRST_HIT' : hits === 2 ? 'BAITER_SECOND_HIT' : 'BAITER_PRESSURE');
    } else if (hits === 1) {
      this.queueBeat('ATEAM_FIRST_HIT');
    } else if (hits === Math.ceil(result.hostage.threshold / 2)) {
      this.queueBeat('ATEAM_MID_HIT');
    }
    this.callbacks.onSync?.();
    if (this.story.interrogationComplete()) {
      this.returnTool('interrogation-complete');
      this._beginIntelReveal();
    }
    return result;
  }

  _beginIntelReveal() {
    if (this._revealingIntel || this.story.ateamIntelLearned() || !this.story.interrogationComplete()) return false;
    this._revealingIntel = true;
    this.queueBeat('ATEAM_REVEAL', () => {
      this._revealingIntel = false;
      const result = this.story.learnAteamIntel();
      if (!result.ok) return;
      this.callbacks.onSync?.();
      this.queueBeat('INTERROGATION_DONE', () => this._beginExecutionOffer());
    });
    return true;
  }

  _beginExecutionOffer() {
    if (this.story.executionChoice() || this.choice.active) return false;
    if (this.beatQueue.some((entry) => entry.id === 'EXECUTION_OFFER')
      || this.dialogue.current === 'EXECUTION_OFFER') return false;
    this.queueBeat('EXECUTION_OFFER');
    return true;
  }

  resolveExecutionChoice(result, reason = 'player') {
    if (this.story.executionChoice()) return false;
    const selected = result === 'player' ? 'player' : 'gratin';
    const marked = this.story.chooseExecution(selected, { reason });
    if (!marked.ok) return false;
    this.choice.close?.();
    this.dialogue.resolveAction('execution-choice');
    this.callbacks.onChoiceClosed?.(selected, reason);
    this._resumeExecutionBranch();
    this.callbacks.onSync?.();
    return true;
  }

  _resumeExecutionBranch({ restored = false } = {}) {
    if (this._executionBranchPending
      || !this.story.executionChoice()
      || this.story.executionBranchVoComplete()) return false;
    const beat = this.story.executionBranch() === 'yes'
      ? 'EXECUTION_YES'
      : this.story.executionBranch() === 'timeout' ? 'EXECUTION_TIMEOUT' : 'EXECUTION_NO';
    this._executionBranchPending = true;
    this.queueBeat(beat, () => {
      this._executionBranchPending = false;
      const marked = this.story.completeExecutionBranchVo();
      if (!marked.ok) return;
      this.callbacks.onSync?.();
      if (this.story.executionChoice() === 'player') {
        this.callbacks.onEquipPistol?.(restored ? { restored: true } : undefined);
      } else {
        this._beginGratinExecution({ restored });
      }
    });
    return true;
  }

  _beginGratinExecution({ restored = false } = {}) {
    if (this.executionClock || this.story.executionChoice() !== 'gratin') return false;
    const authoredShots = [
      { at: 0.72, id: CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER },
      { at: 1.82, id: CABIN_HOSTAGE_IDS.ATEAM_MEMBER },
    ].filter(({ id }) => !this.story.hostageDead(id));
    if (!authoredShots.length) return false;
    this.executionClock = { elapsed: 0, next: 0, shots: authoredShots };
    this.callbacks.onGratinExecutionStart?.({ restored });
    return true;
  }

  _updateExecution(dt) {
    if (!this.executionClock) return;
    this.executionClock.elapsed += dt;
    while (
      this.executionClock.next < this.executionClock.shots.length
      && this.executionClock.elapsed >= this.executionClock.shots[this.executionClock.next].at
    ) {
      const shot = this.executionClock.shots[this.executionClock.next++];
      const before = this.story.hostageState(shot.id);
      const damage = this.story.damageHostage(shot.id, { hits: before.remaining });
      const death = this.story.killHostage(shot.id);
      if (damage.ok && death.ok) {
        this.callbacks.onGratinShot?.(shot.id, death.hostage);
        this.callbacks.onHostageDeath?.(shot.id, death.hostage, 'gratin');
      }
    }
    if (this.executionClock.next >= this.executionClock.shots.length) {
      this.executionClock = null;
      this._queueGratinAftermath();
      this.callbacks.onSync?.();
    }
  }

  _queueGratinAftermath({ restored = false } = {}) {
    if (this._gratinAftermathPending
      || this.story.executionChoice() !== 'gratin'
      || !this.story.deathsComplete()
      || this.story.nightfallComplete()) return false;
    this._gratinAftermathPending = true;
    this.queueBeat('GRATIN_EXECUTES', () => {
      this._gratinAftermathPending = false;
      this._completeDeathTransition({ restored });
    });
    return true;
  }

  shootHostage(id, { hitUnits = 4, impact = null } = {}) {
    const hostageId = storyHostageId(id);
    if (!hostageId) return { ok: false, reason: 'unknown_hostage' };
    if (this.story.executionChoice() !== 'player') {
      return { ok: false, reason: 'player_not_executioner' };
    }
    const before = this.story.hostageState(hostageId);
    if (before.dead) return { ok: false, reason: 'hostage_dead', hostage: before };
    const damage = this.story.damageHostage(hostageId, { hits: Math.max(1, Math.trunc(hitUnits)) });
    if (!damage.ok) return damage;
    this.callbacks.onWeaponHit?.(hostageId, damage.hostage, impact);
    if (damage.hostage.durabilityDepleted) {
      const death = this.story.killHostage(hostageId);
      this.callbacks.onHostageDeath?.(hostageId, death.hostage, 'player');
      this.callbacks.onSync?.();
      return { ...damage, killed: true, hostage: death.hostage };
    }
    this.callbacks.onSync?.();
    return { ...damage, killed: false };
  }

  _completeDeathTransition({ restored = false } = {}) {
    if (this._deathTransitioned || !this.story.deathsComplete()) return false;
    this._deathTransitioned = true;
    const result = this.story.nightfallComplete()
      ? { ok: true, firstTime: false }
      : this.story.completeNightfall();
    if (!result.ok) return false;
    if (result.firstTime) this.callbacks.onNightfall?.({ restored: false });
    if (!this.story.nightfallBriefingComplete()) {
      this.queueBeat('BOTH_DEAD');
      this.queueBeat('WRAP_INSTRUCTIONS', () => {
        this.story.completeNightfallBriefing();
        this.callbacks.onSync?.();
      });
    }
    this.callbacks.onSync?.();
    return true;
  }

  wrapBody(id) {
    const hostageId = storyHostageId(id);
    if (!hostageId) return { ok: false, reason: 'unknown_hostage' };
    const hostage = this.story.hostageState(hostageId);
    if (!hostage.dead || !this.story.nightfallComplete()) {
      return this.story.wrapHostage(hostageId);
    }
    const cleanupId = STORY_TO_CLEANUP_BODY[hostageId];
    if (this.callbacks.onWrapBody?.(cleanupId, hostageId) === false) {
      return { ok: false, reason: 'presentation_refused', hostage };
    }
    const result = this.story.wrapHostage(hostageId);
    if (result.firstTime && !this.firstWrapLinePlayed) {
      this.firstWrapLinePlayed = true;
      this.queueBeat('FIRST_WRAPPED');
    }
    if (this.story.wrappingComplete()) this.prepareBodyCarry();
    this.callbacks.onSync?.();
    return result;
  }

  prepareBodyCarry({ restored = false } = {}) {
    if (!this.story.wrappingComplete() || this.bodyCarryReady) return false;
    this.bodyCarryReady = true;
    if (!restored) this.queueBeat('BODIES_READY');
    return true;
  }

  _moveCastToFire({ restored = false } = {}) {
    if (!this.story.bodiesAtFire() || this.castAtFire) return false;
    this.castAtFire = true;
    this.callbacks.onMoveCastToFire?.({ restored });
    return true;
  }

  beginCarry(id) {
    const hostageId = storyHostageId(id);
    if (!hostageId || !this.story.hostageState(hostageId)?.wrapped || this.story.bodyAtFire(hostageId)) {
      return false;
    }
    return this.callbacks.onBeginCarry?.(STORY_TO_CLEANUP_BODY[hostageId], hostageId) !== false;
  }

  placeBodyAtFire(id) {
    const hostageId = storyHostageId(id);
    if (!hostageId) return { ok: false, reason: 'unknown_hostage' };
    const hostage = this.story.hostageState(hostageId);
    if (!hostage.wrapped) return this.story.moveBodyToFire(hostageId);
    const cleanupId = STORY_TO_CLEANUP_BODY[hostageId];
    if (this.callbacks.onPlaceBodyAtFire?.(cleanupId, hostageId) === false) {
      return { ok: false, reason: 'presentation_refused' };
    }
    const result = this.story.moveBodyToFire(hostageId);
    if (result.firstTime && !this.firstFireLinePlayed) {
      this.firstFireLinePlayed = true;
      this.queueBeat('FIRST_AT_FIRE');
    }
    if (this.story.bodiesAtFire()) {
      this.story.stageBodies();
      this._moveCastToFire();
    }
    this.callbacks.onSync?.();
    return result;
  }

  pourGas() {
    if (!this.story.bodiesAtFire()) return this.story.pourGas();
    if (this.callbacks.onPourGas?.() === false) return { ok: false, reason: 'presentation_refused' };
    const result = this.story.pourGas();
    if (result.firstTime) this.queueBeat('GASOLINE');
    this.callbacks.onSync?.();
    return result;
  }

  igniteBonfire() {
    if (!this.story.gasPoured()) return this.story.igniteBonfire();
    if (this.callbacks.onIgniteBonfire?.() === false) return { ok: false, reason: 'presentation_refused' };
    const result = this.story.igniteBonfire();
    if (result.firstTime) {
      this.queueBeat('IGNITION', () => {
        this.story.completeFireCleanup();
        this._startFireSequence();
        this.callbacks.onSync?.();
      });
    } else if (!this.story.fireCleanupComplete()) {
      this._resumeIgnitedFire();
    }
    return result;
  }

  _resumeIgnitedFire() {
    if (!this.story.bonfireIgnited() || this.story.fireCleanupComplete()) return false;
    if (this.dialogue.current === 'IGNITION'
      || this.beatQueue.some((entry) => entry.id === 'IGNITION')) return false;
    this.queueBeat('IGNITION', () => {
      this.story.completeFireCleanup();
      this._startFireSequence({ restored: true });
      this.callbacks.onSync?.();
    });
    return true;
  }

  _startFireSequence({ restored = false } = {}) {
    if (this.fireSequenceStarted || this.story.blackedOut()) return false;
    this.fireSequenceStarted = true;
    this.callbacks.onFireSequenceStart?.({ restored });
    const beats = restored && this.story.drankAfterCleanup()
      ? FIRE_BEATS.slice(1)
      : FIRE_BEATS;
    for (const beat of beats) {
      this.queueBeat(beat, beat === 'BLACKOUT' ? () => this._blackout() : null);
    }
    return true;
  }

  consume(item) {
    if (!this.pendingConsume || this.pendingConsume.item !== item) return false;
    const action = this.pendingConsume.action;
    this.pendingConsume = null;
    this.intoxication = Math.min(1, this.intoxication + (item === 'whiskey' ? 0.34 : item === 'beer' ? 0.20 : 0.08));
    if (item === 'beer' || item === 'whiskey') {
      if (!this.story.drankAfterCleanup()) this.story.drink();
      this.callbacks.onIntoxication?.(this.intoxication, item);
    }
    this.dialogue.resolveAction(action);
    this.callbacks.onSync?.();
    return true;
  }

  skipOptionalAction() {
    if (!this.pendingConsume?.optional) return false;
    const action = this.pendingConsume.action;
    this.pendingConsume = null;
    return this.dialogue.resolveAction(action);
  }

  _blackout() {
    if (this.story.blackedOut()) return false;
    const result = this.story.blackout();
    if (!result.ok) return false;
    this._blackoutTransitionPending = true;
    const finish = () => {
      if (this._blackoutFinished) return;
      this._blackoutFinished = true;
      this._blackoutTransitionPending = false;
      this.callbacks.onWakeMorning?.({ restored: false });
      this.queueBeat('MORNING');
      this.callRetry = 0.8;
      this.callbacks.onSync?.();
    };
    if (this.callbacks.onBlackout) this.callbacks.onBlackout(finish);
    else finish();
    this.callbacks.onSync?.();
    return true;
  }

  _restoreMorning() {
    this._blackoutFinished = true;
    this._blackoutTransitionPending = false;
    this.callbacks.onWakeMorning?.({ restored: true });
    if (this.dialogue.current !== 'MORNING'
      && !this.beatQueue.some((entry) => entry.id === 'MORNING')) {
      this.queueBeat('MORNING');
    }
    this.callRetry = 0;
  }

  snapshot() {
    return Object.freeze({
      active: this.active,
      phase: this.story.phase(),
      call: this.phone.call?.def?.id || null,
      dialogue: this.dialogue.current,
      queuedBeats: Object.freeze(this.beatQueue.map((entry) => entry.id)),
      choice: this.choice.snapshot?.() || null,
      selectedTool: this.selectedTool,
      toolUseRemaining: this.toolUseRemaining,
      pendingConsume: this.pendingConsume ? Object.freeze({ ...this.pendingConsume }) : null,
      intoxication: this.intoxication,
      executionRunning: Boolean(this.executionClock),
      bodyCarryReady: this.bodyCarryReady,
      castAtFire: this.castAtFire,
      // Compatibility field for preview/debug callers. It now becomes true
      // only after both bodies have genuinely reached the pyre.
      bodiesStagedOutside: this.story.bodiesAtFire(),
    });
  }
}

export function createCabinChapterRuntime(options) {
  return new CabinChapterRuntime(options);
}
