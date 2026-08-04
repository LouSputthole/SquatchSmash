/**
 * What the job is actually scored on.
 *
 * The owner's brief, verbatim: *"We should try to minimize civilian casualties
 * and get all the money."* THE TAKE had neither. It counted bags for the end
 * card and hard-coded `disciplinedFire: true` into the campaign write, so the
 * mission reported a clean professional job whatever the player had actually
 * done in the lobby.
 *
 * Two axes, both live from the first shot:
 *
 *   MONEY   eight vault bags. All eight is the job. Anything you leave on the
 *           street is gone, and cash you took off the customers is worse than
 *           useless — the campaign's own settlement subtracts it (see
 *           `computeHeistSettlement`) and it disqualifies the professional
 *           outcome, because the crew came in for insured paper.
 *   PEOPLE  everybody who walked into that lobby walks out of it. A casualty
 *           is permanent, visible on the HUD the instant it happens, and it is
 *           the one number the debrief reads out first.
 *
 * `src/core/bank-heist-story.js` already had the fields; nothing was writing
 * honest values into them. This is what writes them.
 */

export const HEIST_GRADES = Object.freeze([
  'professional', 'barely_clean', 'hard_exit', 'costly_success',
]);

export class HeistObjectiveLedger {
  constructor({ totalBags = 8, civiliansPresent = 22 } = {}) {
    this.totalBags = totalBags;
    this.civiliansPresent = civiliansPresent;
    this.reset();
  }

  reset() {
    this.shotsFired = 0;
    this.shotsOnTarget = 0;
    this.civilianCasualties = 0;
    this.civilianRoundsFired = 0;
    this.crewFriendlyFire = 0;
    this.officersDown = 0;
    this.hostagesRestrained = 0;
    this.hostagesRobbed = 0;
    this.personalCashTaken = 0;
    this.alarmAttempts = 0;
    this.escapes = 0;
    this.bagsRecovered = 0;
    this.bagsAbandoned = 0;
    this.grossRecovered = 0;
    this.crewHome = 6;
  }

  noteShot({ hitActor = false } = {}) {
    this.shotsFired++;
    if (hitActor) this.shotsOnTarget++;
  }

  noteCivilianHit({ fatal = false } = {}) {
    this.civilianRoundsFired++;
    if (fatal) this.civilianCasualties++;
    return this.civilianCasualties;
  }

  noteFriendlyFire() { this.crewFriendlyFire++; }
  noteOfficerDown() { this.officersDown++; }

  /** Fold in whatever the hostage director currently knows. */
  syncHostages(summary = {}) {
    this.hostagesRestrained = summary.restrained ?? this.hostagesRestrained;
    this.hostagesRobbed = summary.robbed ?? this.hostagesRobbed;
    this.personalCashTaken = summary.personalCashTaken ?? this.personalCashTaken;
    this.alarmAttempts = summary.alarmAttempts ?? this.alarmAttempts;
    this.escapes = summary.escapes ?? this.escapes;
    this.civilianCasualties = Math.max(this.civilianCasualties, summary.casualties ?? 0);
  }

  /** Fold in whatever the loot ledger currently knows. */
  syncLoot(summary = {}) {
    this.bagsRecovered = summary.recoveredBags ?? this.bagsRecovered;
    this.bagsAbandoned = summary.abandonedBags ?? this.bagsAbandoned;
    this.grossRecovered = summary.grossRecovered ?? this.grossRecovered;
  }

  get civiliansSafe() {
    return Math.max(0, this.civiliansPresent - this.civilianCasualties);
  }

  /**
   * Fire discipline: did every round go somewhere it was supposed to?
   *
   * One round into a customer is enough to lose it. Missing is not a crime;
   * shooting the room is.
   */
  get disciplinedFire() {
    return this.civilianRoundsFired === 0 && this.crewFriendlyFire === 0;
  }

  /** Did the crew's own rule hold — nobody left, nothing taken off a person? */
  get followedSnow() {
    return this.crewHome === 6 && this.hostagesRobbed === 0;
  }

  get accuracy() {
    return this.shotsFired ? this.shotsOnTarget / this.shotsFired : 0;
  }

  /**
   * The one-word verdict the debrief reads out.
   *
   * Deliberately the same vocabulary `bank-heist-story.js` already persists, so
   * the card, the save and the Initiation all say the same word.
   */
  grade() {
    if (this.civilianCasualties > 0) return 'costly_success';
    if (this.bagsRecovered <= 4) return 'costly_success';
    if (this.disciplinedFire && this.followedSnow
      && this.personalCashTaken === 0
      && this.bagsRecovered >= this.totalBags - 1) return 'professional';
    if (this.alarmAttempts > 0 || this.escapes > 0 || this.hostagesRobbed > 0) return 'hard_exit';
    return 'barely_clean';
  }

  /** The lines the end card reads, in the order it reads them. */
  scorecard() {
    return [
      {
        key: 'civilians',
        label: 'Civilians out alive',
        value: `${this.civiliansSafe} / ${this.civiliansPresent}`,
        good: this.civilianCasualties === 0,
      },
      {
        key: 'bags',
        label: 'Vault bags recovered',
        value: `${this.bagsRecovered} / ${this.totalBags}`,
        good: this.bagsRecovered >= this.totalBags,
      },
      {
        key: 'crew',
        label: 'Crew home',
        value: `${this.crewHome} / 6`,
        good: this.crewHome === 6,
      },
      {
        key: 'discipline',
        label: 'Fire discipline',
        value: this.disciplinedFire ? 'CLEAN' : `${this.civilianRoundsFired} stray round(s)`,
        good: this.disciplinedFire,
      },
      {
        key: 'restraint',
        label: 'Taken off customers',
        value: this.personalCashTaken
          ? `$${this.personalCashTaken.toLocaleString()} from ${this.hostagesRobbed}`
          : 'NOTHING',
        good: this.personalCashTaken === 0,
      },
      {
        key: 'control',
        label: 'Lobby control',
        value: this.alarmAttempts || this.escapes
          ? `${this.alarmAttempts} alarm, ${this.escapes} ran`
          : 'HELD',
        good: this.alarmAttempts === 0 && this.escapes === 0,
      },
    ];
  }

  /** The exact shape `BankHeistStory.complete()` wants. */
  report() {
    return {
      civiliansHarmed: this.civilianCasualties,
      disciplinedFire: this.disciplinedFire,
      followedSnow: this.followedSnow,
      outcome: this.grade(),
    };
  }

  capture() {
    return {
      shotsFired: this.shotsFired,
      shotsOnTarget: this.shotsOnTarget,
      civilianCasualties: this.civilianCasualties,
      civilianRoundsFired: this.civilianRoundsFired,
      crewFriendlyFire: this.crewFriendlyFire,
      officersDown: this.officersDown,
      hostagesRestrained: this.hostagesRestrained,
      hostagesRobbed: this.hostagesRobbed,
      personalCashTaken: this.personalCashTaken,
      alarmAttempts: this.alarmAttempts,
      escapes: this.escapes,
      bagsRecovered: this.bagsRecovered,
      bagsAbandoned: this.bagsAbandoned,
      grossRecovered: this.grossRecovered,
      crewHome: this.crewHome,
    };
  }

  restore(snapshot = {}) {
    for (const key of Object.keys(this.capture())) {
      if (Number.isFinite(snapshot[key])) this[key] = snapshot[key];
    }
  }
}
