/**
 * Front and Center.
 *
 * The same shape as the Bing's mission: a linear state that only runs forwards,
 * a list of objectives, and a pile of flags that other systems report into. It
 * is a different mission because there is nothing to collect and nothing to
 * fail — the evening happens either way, and what changes is how it ends.
 *
 * Two moments in here take the camera, and only two: the table being built, and
 * the lights going down. Everything between them is the player's.
 */

export const STATES = [
  'not-available',
  'phone-call',           // she rings
  'accepted',             // there is a date
  'starting',             // the car pulls up
  'arrived',              // out on the pavement
  'service-route',        // in the alley, heading for the wrong door
  'cellar',
  'kitchen',
  'corridor',
  'host',                 // at the host station
  'table-cutscene',       // — control off —
  'seating',
  'round-one',            // the entrance
  'drink-order',
  'family',               // somebody stops by
  'personal',
  'performance-cutscene', // — control off —
  'performance',
  'sway',                 // optional
  'invitation',
  'ending',
  'done',
];

/** Where the game will put you back if you reload. */
export const CHECKPOINTS = ['arrived', 'host', 'seating', 'performance', 'invitation'];

/**
 * She does not sit there silently while the player wanders off. These are how
 * long she will wait, in seconds within the current state, before saying so.
 */
const IMPATIENCE = [
  { at: 75,  key: 'waiting1' },
  { at: 160, key: 'waiting2' },
  { at: 280, key: 'waiting3' },
];

export class Mission {
  /**
   * @param {object} hooks { onState, onObjective, onNote, onImpatient, onCheckpoint }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'starting';
    this.objectives = [];
    this.notes = [];
    this.elapsed = 0;
    this.inState = 0;
    this._impatient = 0;
    /** Seconds she has spent more than four metres behind him. */
    this.trailing = 0;
    this.roundsDone = new Set();

    this.flags = {
      /* the street */
      driverTipped: false,
      doorHeld: false,
      askedAboutFront: false,
      /* the route */
      sideDoorOpened: false,
      hazardSeen: false,
      abandonments: 0,
      /* the table */
      tableBuilt: false,
      seated: false,
      chairPulled: false,
      introducedAs: null,     // what he called her, if anybody asked
      drinkOrdered: null,     // 'rye' | 'wrong' | 'asked' | 'house' | 'bottle' | null
      champagneSent: false,
      champagneThanked: false,
      funnyHow: false,
      familyMet: [],          // which recurring characters shook her hand
      /* the show */
      showStarted: false,
      songRequested: null,
      swayed: null,           // 'good' | 'bad' | 'refused' | 'forced' | null
      photo: false,
      toast: null,
      callsTaken: 0,
      chaos: 0,               // spilled drinks, knocked trays, general disgrace
      /* the end */
      invitation: null,       // which line he used
      outcome: null,
    };

    this.addObjective('arrive', 'Get out of the car');
  }

  /* ---------------------------------------------------------------- */

  setState(next) {
    if (this.state === next) return false;
    const order = STATES.indexOf(next);
    if (order < 0) throw new Error(`unknown mission state: ${next}`);
    if (order < STATES.indexOf(this.state)) return false;   // never backwards
    this.state = next;
    this.inState = 0;
    this._impatient = 0;
    this.hooks.onState?.(next, this);
    if (CHECKPOINTS.includes(next)) this.hooks.onCheckpoint?.(next, this);
    return true;
  }

  addObjective(id, text, { optional = false } = {}) {
    if (this.objectives.some((o) => o.id === id)) return;
    this.objectives.push({ id, text, done: false, optional });
    this.hooks.onObjective?.(this.objectives);
  }

  complete(id) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    this.hooks.onObjective?.(this.objectives);
  }

  /** Deduplicated, because the narrator does not repeat himself. */
  note(text) {
    if (this.notes.includes(text)) return;
    this.notes.push(text);
    this.hooks.onNote?.(text);
  }

  /* ---------------------------------------------------------------- */
  /* Beats                                                             */
  /* ---------------------------------------------------------------- */

  outOfCar() {
    this.setState('arrived');
    this.complete('arrive');
    this.addObjective('inside', 'Get her inside');
  }

  intoAlley() {
    if (this.setState('service-route')) {
      this.note('The queue at the front is thirty deep and going nowhere. This is not that door.');
    }
  }

  intoCellar() { this.setState('cellar'); }
  intoKitchen() { this.setState('kitchen'); }
  intoCorridor() { this.setState('corridor'); }

  atHostStation() {
    if (this.setState('host')) this.complete('inside');
  }

  /** The staff build a table. Control is off for this. */
  tableCutscene() { this.setState('table-cutscene'); }

  tableBuilt() {
    this.flags.tableBuilt = true;
    this.setState('seating');
    this.addObjective('sit', 'Sit down with her');
  }

  satDown() {
    this.flags.seated = true;
    this.complete('sit');
    this.setState('round-one');
    this.addObjective('talk', 'Talk to her');
  }

  /** Each conversation round reports in when it is finished with. */
  roundDone(id) {
    this.roundsDone.add(id);
    if (id === 'entrance') this.setState('drink-order');
    if (id === 'drinks') this.setState('family');
    if (id === 'family') this.setState('personal');
    if (id === 'personal') this.complete('talk');
  }

  /** Lights down, curtain up. The other control-off moment. */
  showCutscene() { this.setState('performance-cutscene'); }

  showStarted() {
    this.flags.showStarted = true;
    this.setState('performance');
    this.addObjective('evening', 'Enjoy the evening', { optional: true });
  }

  /**
   * The invitation does not appear the second the band does. It needs the show
   * to have been running a while and the conversation to have got somewhere.
   */
  get invitationReady() {
    if (this.state === 'invitation' || this.state === 'ending' || this.state === 'done') return true;
    if (!this.flags.showStarted) return false;
    if (this.state === 'performance-cutscene') return false;
    return this.inState >= 90 || this.roundsDone.size >= 4;
  }

  offerInvitation() {
    if (!this.invitationReady) return false;
    return this.setState('invitation');
  }

  finish(outcome) {
    this.flags.outcome = outcome;
    this.complete('evening');
    this.setState('ending');
    return outcome;
  }

  done() { this.setState('done'); }

  /* ---------------------------------------------------------------- */
  /* Reported in from elsewhere                                        */
  /* ---------------------------------------------------------------- */

  leftBehind() {
    this.flags.abandonments++;
    return this.flags.abandonments;
  }

  metFamily(who) {
    if (!this.flags.familyMet.includes(who)) this.flags.familyMet.push(who);
  }

  madeAMess() { this.flags.chaos++; }

  /* ---------------------------------------------------------------- */

  update(dt, { trailing = false } = {}) {
    this.elapsed += dt;
    this.inState += dt;
    this.trailing = trailing ? this.trailing + dt : 0;

    /* She only gets bored during the parts that are waiting on the player.
     * Being kept a moment during a cutscene is not being kept waiting. */
    const idle = this.state === 'arrived' || this.state === 'service-route'
      || this.state === 'cellar' || this.state === 'kitchen'
      || this.state === 'corridor' || this.state === 'seating'
      || this.state === 'performance';
    if (!idle) return;

    while (this._impatient < IMPATIENCE.length
           && this.inState >= IMPATIENCE[this._impatient].at) {
      this.hooks.onImpatient?.(IMPATIENCE[this._impatient++].key, this.state);
    }
  }

  /* ---------------------------------------------------------------- */

  /**
   * How the night ends. Score gets a vote; so do the things that no score
   * should be able to buy back.
   *
   * @param {number} score the Woo score
   * @param {string} band  its band key
   */
  resolve(score, band) {
    const f = this.flags;

    // Two things end the evening regardless of how well the rest of it went.
    if (f.invitation === 'transactional') return 'insult';
    if (f.invitation === 'crude' && score < 80) return 'disaster';

    if (f.chaos >= 4 && score >= 50) return 'from-a-distance';

    if (f.invitation === 'none') return score >= 65 ? 'gentleman' : 'polite';

    if (band === 'perfect' && f.drinkOrdered === 'rye' && f.funnyHow) return 'perfect';
    if (score >= 80) return 'strong';
    if (score >= 65) return 'good';
    if (score >= 40) return 'awkward';
    return 'disaster';
  }

  /**
   * What the rest of the game is told when this is over. Deliberately more than
   * the ending needs — the next scene should be able to ask whether she ever
   * found out what he actually does.
   */
  persist(woo) {
    const w = woo.snapshot();
    return {
      mission: 'front-and-center',
      completedAt: this.elapsed,
      woo: w.score,
      band: w.band,
      outcome: this.flags.outcome,
      cameHome: ['perfect', 'strong'].includes(this.flags.outcome),
      seeingHerAgain: ['perfect', 'strong', 'good', 'gentleman'].includes(this.flags.outcome),
      tippedEverybody: w.streak,
      tipsGiven: w.tips.length,
      rememberedDrink: this.flags.drinkOrdered === 'rye',
      swayed: this.flags.swayed,
      funnyHow: this.flags.funnyHow,
      metTheFamily: this.flags.familyMet.slice(),
      embarrassedHimself: this.flags.chaos >= 2 || this.flags.abandonments >= 3,
      choices: {
        invitation: this.flags.invitation,
        introducedAs: this.flags.introducedAs,
        drink: this.flags.drinkOrdered,
        song: this.flags.songRequested,
        toast: this.flags.toast,
      },
      /* She is a recurring character now, or she is not. Keyed by role rather
       * than by name: she has been recast once and the next scene should not
       * have to care. */
      date: {
        met: true,
        available: this.flags.outcome !== 'insult' && this.flags.outcome !== 'disaster',
        knowsWhatHeDoes: this.roundsDone.has('personal'),
      },
    };
  }
}

/* ------------------------------------------------------------------ */

export const ENDINGS = {
  perfect: {
    title: 'FRONT AND CENTER',
    body: 'She was already standing when you finished the sentence. You went out through the '
      + 'front — past the rope, past the thirty people who had been out there since before you '
      + 'arrived, past the man on the door who held it and said goodnight to her by name because '
      + 'he had heard you say it. She did not look back at the room once. She had already seen it.',
  },
  strong: {
    title: 'FRONT AND CENTER',
    body: 'One drink, she said, in the voice of a woman who has said one drink before. She kept '
      + 'the rye. She kept the ice cube. On the pavement she asked whether your building had a '
      + 'service entrance and told you that if it did she was getting back in the car.',
  },
  good: {
    title: 'FRONT AND CENTER',
    body: 'She let you put her in a cab, wound the window down, and said she had had a genuinely '
      + 'good time — which she meant, and which is why she said the rest of it: do not ruin that '
      + 'by being in a hurry. Then she told you to listen to the show. Thursday. She would say '
      + 'something only you would catch.',
  },
  gentleman: {
    title: 'FRONT AND CENTER',
    body: 'You did not ask, and she noticed you did not ask, and the noticing was worth more than '
      + 'the asking would have been. She wrote nothing down and gave you nothing to hold. She said '
      + 'call the station. She said they put everybody through at that hour, because nobody calls.',
  },
  polite: {
    title: 'FRONT AND CENTER',
    body: 'She thanked you for dinner the way you thank a man for dinner. The cab was already '
      + 'there — she had asked the coat check to ring one somewhere around the second course, and '
      + 'you were not supposed to work that out until now.',
  },
  awkward: {
    title: 'FRONT AND CENTER',
    body: 'She was polite about it, which was worse. She let the manager call her a car and stood '
      + 'under the canopy talking to him about the band while you held her coat. He got more out '
      + 'of her in four minutes than you managed all night. Lou will ring about this. Lou rings '
      + 'about everything.',
  },
  disaster: {
    title: 'FRONT AND CENTER',
    body: 'She left through the kitchen. Every one of them watched her go and not one of them '
      + 'looked at you, which in that building is a formal statement. The cook you did not tip '
      + 'held the door. Somebody will tell Lou before you get to the car.',
  },
  insult: {
    title: 'FRONT AND CENTER',
    body: 'She looked at the money on the tablecloth for a long moment, and then at you, and what '
      + 'was on her face was not anger — it was a professional noting the exact instant an evening '
      + 'died. She left it where it was. So did the waiter. It was still sitting there when they '
      + 'turned the house lights up.',
  },
  'from-a-distance': {
    title: 'FRONT AND CENTER',
    body: '"I like you," she said, from the far side of a table you had partially destroyed. '
      + '"From a distance. A good distance. This one." She was laughing when she said it, which '
      + 'is the only reason it did not sting, and she was already reaching for her coat, which is '
      + 'the reason it did.',
  },
};
