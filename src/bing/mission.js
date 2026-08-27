/**
 * A Quick Stop at the Bing.
 *
 * The mission is a state machine with one requirement -- get the package --
 * and no way to fail. Everything optional in the club runs alongside it and
 * reports in: the slot machine, the table, the bar, the sedan in the lot. The
 * only thing that changes is what Lou says and how the evening ends.
 */

export const STATES = [
  'lot',            // sitting in the car, engine running
  'outside',        // out of the car, crossing the lot
  'club',           // inside, wandering
  'hallway',        // through the back
  'office',         // in with Lou
  'package',        // the thing is on the desk
  'briefed',        // he has said his piece
  'leaving',        // back out through the club
  'lot-return',     // in the lot with it on you
  'done',
];

/** How long Lou will sit there before he starts sending messages. */
const NUDGE = [
  { at: 120, text: 'LOU: You sightseeing?' },
  { at: 300, text: 'LOU: Back office. Now.' },
  { at: 480, text: 'LOU: I have sent somebody.' },
];

export class Mission {
  /**
   * @param {object} hooks { onObjective, onState, onMessage, onNote }
   *
   * `onMessage(text, kind)` — `kind` is 'text' by default and every message
   * this class sends is one: they are Lou, in the back office, texting the
   * prospect's phone. The scene turns that into a pocket buzz rather than a
   * ringtone, so the club is not pretending somebody is calling. The second
   * visit's mission sends 'shout' for the one message that is a person in the
   * room instead.
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'lot';
    /** Seconds since the prospect walked in. Lou is counting. */
    this.waited = 0;
    this.inside = false;
    this.objectives = [];
    this.notes = [];
    this._nudged = 0;
    this.hands = 0;
    this.spins = 0;
    this.drinks = 0;
    this.associateSent = false;
    this.flags = {
      bouncerCleared: false,
      heardAboutCar: false,
      sawCar: false,
      toldLou: false,
      gotPackage: false,
      inspected: 0,
      jackpot: false,
      leftByRear: false,
      alarmTripped: false,
      secretPanel: false,
      plateRead: false,
      /* The one thing the woman at the end of the bar changes. Flavour, not a
       * gate: the campaign decides whether the date happens. */
      heardHerDrink: false,
      /* She has introduced herself. The objective and the interaction prompt
       * both stop calling her "the woman at the end of the bar" once she has
       * a name, which is how names work. */
      metHer: false,
      gaveNumber: false,
      /* The shot Booskibro will not take no for an answer about. */
      tookShot: false,
      foundBody: false,
    };

    /* Lou owns the route. Margo and Booski are real opportunities in the room,
     * but neither locks the bouncer or the car, so presenting all three as
     * equally required made the objective card disagree with the exit. */
    this.addObjective('lou', 'Meet Lou in the back office');
    this.addObjective('margo', 'Talk to the cute girl at the bar', { optional: true });
    this.addObjective('shot', 'Take a shot with Booski', { optional: true });
  }

  get readyToLeave() {
    /* The package in hand is not the end of Lou's briefing. `louDone()` owns
     * both the final spoken beat and the leave objective, so the bouncer and
     * car must read that same state instead of opening one beat early. */
    return this.flags.gotPackage && STATES.indexOf(this.state) >= STATES.indexOf('briefed');
  }

  /* ---------------------------------------------------------------- */

  setState(next) {
    if (this.state === next) return;
    const order = STATES.indexOf(next);
    if (order < STATES.indexOf(this.state)) return;   // never runs backwards
    this.state = next;
    this.hooks.onState?.(next, this);
  }

  addObjective(id, text, { optional = false } = {}) {
    if (this.objectives.some((o) => o.id === id)) return;
    this.objectives.push({ id, text, done: false, ...(optional ? { optional: true } : {}) });
    this.hooks.onObjective?.(this.objectives);
  }

  complete(id) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    this.hooks.onObjective?.(this.objectives);
  }

  /** A line for the narrator; deduplicated, because he does not repeat himself. */
  note(text) {
    if (this.notes.includes(text)) return;
    this.notes.push(text);
    this.hooks.onNote?.(text);
  }

  /* ---------------------------------------------------------------- */
  /* Beats                                                             */
  /* ---------------------------------------------------------------- */

  enteredClub() {
    this.inside = true;
    this.setState('club');
  }

  reachedHallway() {
    this.setState('hallway');
    this.complete('lou');
    this.addObjective('office', 'Go into Lou’s office');
  }

  enteredOffice() {
    this.setState('office');
    this.complete('office');
    this.addObjective('speak', 'Hear Lou out');
  }

  parcelOut() {
    this.setState('package');
    this.complete('speak');
    this.addObjective('take', 'Take the package');
  }

  tookPackage() {
    this.flags.gotPackage = true;
    this.complete('take');
    this.addObjective('listen', 'Let Lou finish');
  }

  louDone() {
    this.setState('briefed');
    this.complete('listen');
    this.addObjective('leave', 'Leave the Bada Bing');
  }

  leftOffice() {
    if (this.state === 'briefed') this.setState('leaving');
  }

  backInLot() {
    if (this.state === 'leaving') this.setState('lot-return');
  }

  finish(kind) {
    this.complete('leave');
    this.setState('done');
    return kind;
  }

  /* ---------------------------------------------------------------- */
  /* Optional activity reports back here                               */
  /* ---------------------------------------------------------------- */

  handPlayed() {
    this.hands++;
    if (this.hands === 3) this.hooks.onMessage?.('LOU: You sightseeing?');
    if (this.hands === 6) this.hooks.onMessage?.('LOU: Back office. Now.');
    if (this.hands === 10 && !this.associateSent) this.sendAssociate();
  }

  spun() { this.spins++; }

  drank() { this.drinks++; }

  jackpot() {
    this.flags.jackpot = true;
    this.hooks.onMessage?.('LOU: What in God’s name was that noise.');
  }

  sendAssociate() {
    if (this.associateSent || this.flags.gotPackage) return;
    this.associateSent = true;
    this.hooks.onAssociate?.();
  }

  /* ---------------------------------------------------------------- */

  update(dt) {
    if (!this.inside || this.flags.gotPackage) return;
    this.waited += dt;
    while (this._nudged < NUDGE.length && this.waited >= NUDGE[this._nudged].at) {
      const n = NUDGE[this._nudged++];
      this.hooks.onMessage?.(n.text);
      if (n.at >= 480) this.sendAssociate();
    }
  }

  /**
   * How the evening reads on the way out. Not a score -- a description.
   */
  ending() {
    const f = this.flags;
    if (f.leftByRear && !f.toldLou) return 'rear';
    if (f.toldLou) return 'warned';
    if (f.plateRead) return 'plate';
    return 'followed';
  }
}

export const ENDINGS = {
  followed: {
    title: 'A QUICK STOP AT THE BING',
    body: 'You pulled out onto the highway with the package under your jacket, and the grey '
      + 'sedan pulled out four cars back. It stayed there through two lights. Whoever they are, '
      + 'they now know where you are going, which makes two of you.',
  },
  plate: {
    title: 'A QUICK STOP AT THE BING',
    body: 'You walked past their bumper on the way out and read the plate without breaking step. '
      + 'They noticed you noticing. The sedan was gone before you reached the exit, which tells '
      + 'you something about how badly they wanted to be seen.',
  },
  warned: {
    title: 'A QUICK STOP AT THE BING',
    body: 'One of Lou’s men was leaning on the canopy post when you came out, smoking, watching '
      + 'the grey sedan the way you watch a dog you have not decided about. It was still there '
      + 'when you left. It did not follow.',
  },
  rear: {
    title: 'A QUICK STOP AT THE BING',
    body: 'You went out through the store room, down the alley past the dumpster, and got into '
      + 'your car from the dark side of the lot. Nobody saw you leave, including the two men '
      + 'whose entire job tonight was to see you leave.',
  },
};
