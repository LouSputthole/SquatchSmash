export const PALACE_BEATS = Object.freeze({
  IDLE: 'idle',
  APPROACH: 'approach',
  PERIMETER: 'perimeter',
  ESTATE: 'estate',
  BETRAYAL: 'betrayal',
  DINING_ROOM: 'dining_room',
  CLEAR: 'clear',
});

export const EVIDENCE_IDS = Object.freeze({
  BELONGINGS: 'sauce_belongings',
  PAYMENT_LEDGER: 'sauce_payment_ledger',
  SECURITY_STILL: 'sauce_security_still',
});

/**
 * The hard fact inside the office ledger, shared by the physical clue and the
 * accusation it earns. These are the live campaign anchors: the Silver Case
 * reaches Lou's mansion at 17:55, then the overnight Mansion Siege opens at
 * 02:10. SHORT BUS is the operation name heard in the Act-One dungeon.
 * Sauce's consultant number signs both rows, while a redacted active-prospect
 * countersign proves the breach still had help inside the Family.
 */
export const PALACE_CASE_ROUTE_EVIDENCE = Object.freeze({
  cargo: 'SILVER CASE',
  operation: 'SHORT BUS',
  destination: 'LOU RESIDENCE',
  deliveryAt: '17:55',
  breachAt: '02:10',
  breachRelation: 'NEXT MORNING',
  source: 'SAUCE / CONSULTANT 14',
  insideContact: 'SILVER CIRCLE / PROSPECT INTAKE — ID REDACTED',
});

const CHECKPOINT_BEATS = Object.freeze({
  approach: PALACE_BEATS.APPROACH,
  perimeter: PALACE_BEATS.PERIMETER,
  estate: PALACE_BEATS.ESTATE,
  betrayal: PALACE_BEATS.BETRAYAL,
  dining_room: PALACE_BEATS.DINING_ROOM,
  clear: PALACE_BEATS.CLEAR,
});

const PALACE_OUTCOMES = Object.freeze(['clean', 'hard_exit', 'costly_success']);
const ALARM_REASONS = Object.freeze(['detected', 'guard_contact', 'gunshot']);

const OBJECTIVES = Object.freeze({
  [PALACE_BEATS.APPROACH]: Object.freeze({
    kicker: 'THE CARTEL PALACE',
    text: 'Reach the service gate without raising the alarm.',
    hint: 'Stay low. Guards notice movement and gunfire.',
  }),
  [PALACE_BEATS.PERIMETER]: Object.freeze({
    kicker: 'PERIMETER',
    text: 'Cross the dark courtyard and enter through the service wing.',
    hint: 'The cut power has blinded the exterior cameras.',
  }),
  [PALACE_BEATS.ESTATE]: Object.freeze({
    kicker: 'INSIDE THE ESTATE',
    text: 'Search the security room for evidence of Sauce.',
    hint: 'The surveillance station is off the service corridor.',
  }),
  [PALACE_BEATS.BETRAYAL]: Object.freeze({
    kicker: 'THE RESCUE IS OVER',
    text: 'Reach the dining room. Sauce and the palace boss are both targets.',
    hint: 'The dining-room doors are beyond the portrait gallery.',
  }),
  [PALACE_BEATS.DINING_ROOM]: Object.freeze({
    kicker: 'THE DINING ROOM',
    text: 'Hold fire and hear them out.',
    hint: 'You can move. Tony unlocks the trigger when he delivers the verdict.',
  }),
  /* THE PROSPECT IS NOT LEAVING FOR THE INITIATION HERE.
   *
   * Owner, 2026-08-24. Four separate places -- this hint, the terrace prompt,
   * the ending card and its button -- told him he was, and the campaign graph
   * has not agreed with any of them since the Palace was repointed: the edge
   * out of `SCENES[CARTEL_PALACE]` goes to the SPECIAL MEETING, and it is that
   * scene which hands off to the Initiation at the treeline. What happens
   * after the terrace is that Tony goes home not knowing whether killing Sauce
   * was the right call, and waits for a phone call. Nothing in the Palace
   * should promise him a ceremony he has not been invited to yet. */
  [PALACE_BEATS.CLEAR]: Object.freeze({
    kicker: 'PALACE CLEAR',
    text: 'Leave through the dining terrace.',
    hint: 'Nobody left in this house is going to tell you whether that was right.',
  }),
});

/**
 * ONE CLUE AT A TIME, FROM THE SAME LEDGER THAT UNLOCKS THE DINING ROOM.
 *
 * Owner, 2026-08-28: *"The mission needs more objective guidance... Objectives
 * should update immediately after the relevant action completes. Never leave
 * an objective pointing backward to something already finished."*
 *
 * The Palace used to hold one generic ESTATE card through all three pieces of
 * evidence. The evidence count moved, but the standing order did not, so the
 * player who found the surveillance still was still told only to "search for
 * Sauce." This route is a recommendation, not a second progression system:
 * every card is selected from `evidenceFound`, the exact array whose third
 * entry ends the search beat. Finding a clue out of order simply selects the
 * first clue that is genuinely still missing.
 */
const ESTATE_EVIDENCE_ROUTE = Object.freeze([
  Object.freeze({
    id: EVIDENCE_IDS.SECURITY_STILL,
    objective: OBJECTIVES[PALACE_BEATS.ESTATE],
  }),
  Object.freeze({
    id: EVIDENCE_IDS.BELONGINGS,
    objective: Object.freeze({
      kicker: 'SAUCE WAS LET IN',
      text: 'Search Sauce\'s bedroom for proof he was staying here.',
      hint: 'Use the finished doorway beside the surveillance station.',
    }),
  }),
  Object.freeze({
    id: EVIDENCE_IDS.PAYMENT_LEDGER,
    objective: Object.freeze({
      kicker: 'SAUCE WAS LIVING HERE',
      text: 'Search the estate office for the payment trail.',
      hint: 'Cross the central hall and check the desk under the task lamp.',
    }),
  }),
]);

function objectiveFor(beat, evidenceFound = []) {
  if (beat !== PALACE_BEATS.ESTATE) return OBJECTIVES[beat] ?? null;
  const found = new Set(evidenceFound);
  return ESTATE_EVIDENCE_ROUTE.find((step) => !found.has(step.id))?.objective
    ?? OBJECTIVES[PALACE_BEATS.BETRAYAL];
}

/**
 * THE DINING ROOM IS FIVE ROOMS NOW, AND THE CARD HAS TO KEEP UP.
 *
 * `OBJECTIVES[DINING_ROOM]` is one line for the whole beat, which was true
 * while the beat was one fight. Since the 2026-08-25 rewire it is four --
 * Sauce alone, Mark in his plates, the A-Team he calls, and Mark with nothing
 * -- and a card reading *"Mark is armored. Break his protection"* while Mark
 * is not even in the building is worse than no card at all.
 *
 * Keyed by `CartelPalaceFinale.stage`. The runtime pushes the matching entry
 * whenever the stage turns. The confrontation owns a card too: it is the
 * visible explanation for why movement still works while firing does not.
 */
export const PALACE_DINING_OBJECTIVES = Object.freeze({
  confrontation: Object.freeze({
    kicker: 'THE DINING ROOM',
    text: 'Hold fire and hear them out.',
    hint: 'You can move. Tony unlocks the trigger when he delivers the verdict.',
  }),
  sauce: Object.freeze({
    kicker: 'THE CHEF IS ALONE',
    text: 'Eliminate Sauce and secure the room.',
    hint: 'Mark walked out and left his chef to entertain you.',
  }),
  'reprisal-one': Object.freeze({
    kicker: 'MARK CAME BACK',
    text: 'Break Mark\'s armor.',
    hint: 'The plates are what is keeping him in the room. Take them off him.',
  }),
  wave: Object.freeze({
    kicker: 'HE CALLED EVERYBODY',
    text: 'Clear the A-Team out of the dining room.',
    hint: 'Mark is behind the doors until the last of them is down.',
  }),
  'reprisal-final': Object.freeze({
    kicker: 'NOTHING LEFT ON HIM',
    text: 'Finish Mark.',
    hint: 'No plates, no crew, no chef. Just the man who sold your family.',
  }),
});

/**
 * Pure mission authority for the final infiltration. The browser runtime owns
 * rendering and combat; this class owns only player-visible progression.
 */
export class CartelPalaceMission {
  constructor({
    onObjective = () => {}, onReveal = () => {}, onCheckpoint = () => {}, onComplete = () => {},
  } = {}) {
    this.onObjective = onObjective;
    this.onReveal = onReveal;
    this.onCheckpoint = onCheckpoint;
    this.onComplete = onComplete;
    this.beat = PALACE_BEATS.IDLE;
    this.rescueCoverIntact = true;
    this.sauceBetrayalConfirmed = false;
    this.evidenceFound = [];
    this.powerCut = false;
    this.alarmRaised = false;
    this.alarmReason = null;
    this.markEliminated = false;
    this.sauceEliminated = false;
    this.outcome = null;
    this.completed = false;
  }

  begin() {
    if (this.beat !== PALACE_BEATS.IDLE) return false;
    this.beat = PALACE_BEATS.APPROACH;
    this.onObjective(objectiveFor(this.beat, this.evidenceFound));
    return true;
  }

  restore(snapshot = {}) {
    const savedBeat = CHECKPOINT_BEATS[snapshot.checkpoint];
    if (!savedBeat || !['in_progress', 'complete'].includes(snapshot.status)) return false;
    const savedOutcome = PALACE_OUTCOMES.includes(snapshot.outcome)
      ? snapshot.outcome : null;
    const unresolvedLegacyClear = savedBeat === PALACE_BEATS.CLEAR && !savedOutcome;
    const beat = unresolvedLegacyClear ? PALACE_BEATS.DINING_ROOM : savedBeat;
    this.beat = beat;
    const valid = new Set(Object.values(EVIDENCE_IDS));
    this.evidenceFound = [...new Set(
      (Array.isArray(snapshot.evidenceFound) ? snapshot.evidenceFound : []).filter((id) => valid.has(id)),
    )];
    const atReveal = [PALACE_BEATS.BETRAYAL, PALACE_BEATS.DINING_ROOM, PALACE_BEATS.CLEAR]
      .includes(beat);
    if (atReveal) {
      this.evidenceFound = Object.values(EVIDENCE_IDS);
      this.rescueCoverIntact = false;
      this.sauceBetrayalConfirmed = true;
    }
    // The only authored route beyond the approach is through the cut-power
    // service gate. Campaign schema intentionally stores the checkpoint, not
    // this derived fact, so resuming deeper in the estate must reconstruct it.
    this.powerCut = snapshot.powerCut === true || beat !== PALACE_BEATS.APPROACH;
    this.alarmRaised = snapshot.alarmRaised === true
      || savedOutcome === 'hard_exit'
      || savedOutcome === 'costly_success';
    this.alarmReason = this.alarmRaised
      ? (ALARM_REASONS.includes(snapshot.alarmReason) ? snapshot.alarmReason : 'detected')
      : null;
    this.markEliminated = !unresolvedLegacyClear
      && (snapshot.markEliminated === true || beat === PALACE_BEATS.CLEAR);
    this.sauceEliminated = !unresolvedLegacyClear
      && (snapshot.sauceEliminated === true || beat === PALACE_BEATS.CLEAR);
    this.outcome = unresolvedLegacyClear ? null : savedOutcome;
    this.completed = snapshot.status === 'complete';
    this.onObjective(objectiveFor(beat, this.evidenceFound));
    return true;
  }

  _durableFacts() {
    return {
      evidenceFound: [...this.evidenceFound],
      sauceBetrayalConfirmed: this.sauceBetrayalConfirmed,
      alarmRaised: this.alarmRaised,
      alarmReason: this.alarmReason,
      markEliminated: this.markEliminated,
      sauceEliminated: this.sauceEliminated,
      outcome: this.outcome,
    };
  }

  _checkpointProgress() {
    this.onCheckpoint(this.beat, this._durableFacts());
  }

  _go(beat) {
    this.beat = beat;
    this.onObjective(objectiveFor(beat, this.evidenceFound));
    this._checkpointProgress();
    return true;
  }

  enterPerimeter({ powerCut = false } = {}) {
    if (this.beat !== PALACE_BEATS.APPROACH) return false;
    this.powerCut = powerCut === true;
    return this._go(PALACE_BEATS.PERIMETER);
  }

  enterEstate() {
    if (this.beat !== PALACE_BEATS.PERIMETER) return false;
    return this._go(PALACE_BEATS.ESTATE, { powerCut: this.powerCut });
  }

  collectEvidence(id) {
    if (this.beat !== PALACE_BEATS.ESTATE || !Object.values(EVIDENCE_IDS).includes(id)) {
      return false;
    }
    if (this.evidenceFound.includes(id)) return false;
    this.evidenceFound.push(id);
    if (this.evidenceFound.length === Object.keys(EVIDENCE_IDS).length) {
      this.rescueCoverIntact = false;
      this.sauceBetrayalConfirmed = true;
      const facts = {
        evidenceFound: [...this.evidenceFound],
        sauceBetrayalConfirmed: true,
      };
      this.onReveal(facts);
      this._go(PALACE_BEATS.BETRAYAL);
    } else {
      /* The clue ledger and the card turn over in the same transaction. A
       * reload gets the same result through restore() above; no parallel
       * objective flags can disagree with the mission gate. */
      this.onObjective(objectiveFor(this.beat, this.evidenceFound));
      this._checkpointProgress();
    }
    return true;
  }

  raiseAlarm(reason = 'detected') {
    if (this.completed || this.alarmRaised) return false;
    this.alarmRaised = true;
    this.alarmReason = ALARM_REASONS.includes(reason) ? reason : 'detected';
    this._checkpointProgress();
    return true;
  }

  enterDiningRoom() {
    if (this.beat !== PALACE_BEATS.BETRAYAL || !this.sauceBetrayalConfirmed) return false;
    return this._go(PALACE_BEATS.DINING_ROOM);
  }

  registerTargetDown(id) {
    if (this.beat !== PALACE_BEATS.DINING_ROOM) return false;
    if (id === 'mark') {
      if (this.markEliminated) return false;
      this.markEliminated = true;
    } else if (id === 'sauce') {
      if (this.sauceEliminated) return false;
      this.sauceEliminated = true;
    } else {
      return false;
    }
    if (this.markEliminated && this.sauceEliminated) {
      this.outcome = this.alarmRaised ? 'hard_exit' : 'clean';
      this._go(PALACE_BEATS.CLEAR);
    } else {
      this._checkpointProgress();
    }
    return true;
  }

  extract() {
    if (this.beat !== PALACE_BEATS.CLEAR || this.completed) return false;
    this.completed = true;
    this.onComplete({
      evidenceFound: [...this.evidenceFound],
      sauceBetrayalConfirmed: this.sauceBetrayalConfirmed,
      markEliminated: this.markEliminated,
      sauceEliminated: this.sauceEliminated,
      outcome: this.outcome,
    });
    return true;
  }

  snapshot() {
    return {
      beat: this.beat,
      rescueCoverIntact: this.rescueCoverIntact,
      sauceBetrayalConfirmed: this.sauceBetrayalConfirmed,
      evidenceFound: [...this.evidenceFound],
      powerCut: this.powerCut,
      alarmRaised: this.alarmRaised,
      alarmReason: this.alarmReason,
      markEliminated: this.markEliminated,
      sauceEliminated: this.sauceEliminated,
      outcome: this.outcome,
      completed: this.completed,
    };
  }
}
