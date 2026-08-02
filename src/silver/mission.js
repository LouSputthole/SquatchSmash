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

/**
 * Asking her back with less than this much of the show behind you is rushing
 * it. Twenty seconds of a supper club is nothing — it is the length of the
 * applause — and that is the point: the penalty is for the man who sat down at
 * the front table and immediately suggested leaving it.
 */
const RUSHED_UNDER = 20;

const at = (state) => STATES.indexOf(state);

/**
 * The evening, as a list on the side of the screen.
 *
 * There were five objectives in the whole mission and four of them were
 * handed out at the moment they became impossible to miss — "Get her inside"
 * arrived when he was already on the pavement outside, "Talk to her" when she
 * had already started. A player who put it down after the cellar and came
 * back had nothing anywhere telling him where he had got to, and the two
 * halves of the route that are actually easy to be lost in — the back of
 * house, and the four conversations at the table — were not on it at all.
 *
 * So the board is derived rather than accumulated. Every line names the state
 * it appears at and the state that finishes it, both of them out of the same
 * ordered list the mission already runs on, which means it cannot disagree
 * with where the evening actually is and a checkpoint restores it for free.
 * Nothing shows before its time — the table appearing, the band coming on and
 * the question at the end are the three surprises this scene has and the HUD
 * is not going to be what spoils them.
 *
 * `done` on an optional line is a predicate rather than a state, because
 * optional things are done by doing them and not by moving on.
 */
const BOARD = [
  { id: 'arrive', from: 'starting', until: 'arrived', text: 'Get out of the car' },
  { id: 'alley', from: 'arrived', until: 'service-route', text: 'Find the service entrance, round the side' },
  { id: 'front', from: 'arrived', until: 'service-route', optional: true, text: 'Tell her why you are not using the front door', done: (m) => m.flags.askedAboutFront },
  { id: 'cellar', from: 'service-route', until: 'cellar', text: 'In at the service door and down the ramp' },
  { id: 'staff', from: 'service-route', until: 'performance', optional: true, text: 'Look after the room on the way through', done: (m) => m.flags.backOfHouseTipped >= 6 },
  { id: 'kitchen', from: 'cellar', until: 'kitchen', text: 'Through the cellar and up into the kitchen' },
  { id: 'keepup', from: 'cellar', until: 'host', optional: true, text: 'Do not lose her back there', done: (m) => at(m.state) >= at('host') && m.flags.abandonments === 0 },
  { id: 'corridor', from: 'kitchen', until: 'corridor', text: 'Out of the kitchen and down the corridor' },
  { id: 'inside', from: 'corridor', until: 'host', text: 'Come out on the floor and find the host' },
  { id: 'table', from: 'host', until: 'seating', text: 'Get a table' },
  { id: 'sit', from: 'seating', until: 'round-one', text: 'Sit down with her' },
  { id: 'chair', from: 'seating', until: 'performance', optional: true, text: 'Pull her chair out', done: (m) => m.flags.chairPulled },
  { id: 'r-entrance', from: 'round-one', until: 'drink-order', text: 'Talk about how you got her in here' },
  { id: 'r-drinks', from: 'drink-order', until: 'family', text: 'Order the drinks' },
  { id: 'r-rye', from: 'drink-order', until: 'performance', optional: true, text: 'Remember what she drinks', done: (m) => m.flags.drinkOrdered === 'rye' },
  { id: 'r-family', from: 'family', until: 'personal', text: 'Get through the interruption' },
  { id: 'r-personal', from: 'personal', until: 'performance-cutscene', text: 'Answer the question she actually asked' },
  { id: 'song', from: 'performance', until: 'ending', optional: true, text: 'Ask the band for something', done: (m) => !!m.flags.songRequested },
  { id: 'sway', from: 'performance', until: 'ending', optional: true, text: 'Dance with her', done: (m) => !!m.flags.swayed },
  { id: 'toast', from: 'performance', until: 'ending', optional: true, text: 'Raise a glass', done: (m) => !!m.flags.toast },
  { id: 'ask', from: 'performance', until: 'ending', text: 'Stay for the third number, then ask her about seeing her again' },
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
    /** Seconds into the state he asked out of, or null if he has not asked. */
    this.askedAfter = null;

    this.flags = {
      /* the street */
      driverTipped: false,
      doorHeld: false,
      askedAboutFront: false,
      /* the route */
      sideDoorOpened: false,
      hazardSeen: false,
      abandonments: 0,
      /* How many of the seven people between the alley and the curtain have
       * been taken care of. Counted here rather than read off the Woo ledger
       * because the board is a view of the mission and the mission does not
       * know what a Woo is. */
      backOfHouseTipped: 0,
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
      mainPerformanceStarted: false,
      mainPerformanceComplete: false,
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

    this.refreshBoard();
  }

  /* ---------------------------------------------------------------- */

  /**
   * Rebuild the visible list from where the evening actually is.
   *
   * Called by everything that could change the answer, which is cheap: it is
   * twenty comparisons against an array index. A line that has been shown
   * stays shown even once its `from` state is behind — crossing something out
   * is most of the point of a list, and a board that removed finished work
   * would be empty for the whole of the second half.
   */
  refreshBoard() {
    const now = at(this.state);
    const seen = new Set(this.objectives.map((o) => o.id));
    let changed = false;
    for (const line of BOARD) {
      if (now < at(line.from) && !seen.has(line.id)) continue;
      const done = line.done ? !!line.done(this) : now >= at(line.until);
      const had = this.objectives.find((o) => o.id === line.id);
      if (!had) {
        this.objectives.push({ id: line.id, text: line.text, done, optional: !!line.optional });
        changed = true;
      } else if (done && !had.done) {
        had.done = true;
        changed = true;
      }
    }
    /* Only when it has actually moved. The board is cheap enough to derive
     * every frame -- twenty index comparisons -- and repainting the DOM every
     * frame is not, so the hook is the thing that gets rationed. */
    if (changed) this.hooks.onObjective?.(this.objectives);
    return changed;
  }

  setState(next) {
    if (this.state === next) return false;
    const order = STATES.indexOf(next);
    if (order < 0) throw new Error(`unknown mission state: ${next}`);
    if (order < STATES.indexOf(this.state)) return false;   // never backwards
    this._enter(next);
    return true;
  }

  /** The actual move. Split out because two things are allowed to do it. */
  _enter(next) {
    this.state = next;
    this.inState = 0;
    this._impatient = 0;
    this.hooks.onState?.(next, this);
    this.refreshBoard();
    if (CHECKPOINTS.includes(next)) this.hooks.onCheckpoint?.(next, this);
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
    this.setState('host');
  }

  /** The staff build a table. Control is off for this. */
  tableCutscene() { this.setState('table-cutscene'); }

  tableBuilt() {
    this.flags.tableBuilt = true;
    this.setState('seating');
  }

  satDown() {
    this.flags.seated = true;
    this.setState('round-one');
  }

  /** Each conversation round reports in when it is finished with. */
  roundDone(id) {
    this.roundsDone.add(id);
    if (id === 'entrance') this.setState('drink-order');
    if (id === 'drinks') this.setState('family');
    if (id === 'family') this.setState('personal');
    this.refreshBoard();
  }

  /** Lights down, curtain up. The other control-off moment. */
  showCutscene() { this.setState('performance-cutscene'); }

  showStarted() {
    this.flags.showStarted = true;
    this.setState('performance');
  }

  /* ---- the optional dance ----
   *
   * The one state that comes back where it came from. Getting up happens
   * *during* the performance, so `sway` is a detour rather than a step, and
   * `setState` — which is right to refuse everything backwards — cannot undo it.
   * Left to it, the evening finished the dance and stayed in `sway` for good:
   * not an idle state, so she stopped noticing being left at the table, and
   * every later beat measured its patience against a state nobody was in.
   */
  startSway() { return this.setState('sway'); }

  endSway() {
    if (this.state !== 'sway') return false;
    this._enter('performance');
    return true;
  }

  /**
   * The invitation does not appear the second the band does. It needs the show
   * to have been running a while and the conversation to have got somewhere.
   */
  get invitationReady() {
    if (this.state === 'invitation' || this.state === 'ending' || this.state === 'done') return true;
    if (!this.flags.showStarted) return false;
    if (this.state === 'performance-cutscene') return false;
    if (!this.flags.mainPerformanceComplete) return false;
    return this.inState >= 90 || this.roundsDone.size >= 4;
  }

  /**
   * He asks. What is worth recording is *when* he asked, measured in the state
   * he asked out of — because the timing judgement happens two nodes later, by
   * which time `inState` has been reset by the move into `invitation` and reads
   * as a man who has been sitting there for no time at all. That is how the
   * rush penalty came to fire on every single run, including the careful ones.
   */
  offerInvitation() {
    if (!this.invitationReady) return false;
    this.askedAfter = this.inState;
    return this.setState('invitation');
  }

  /**
   * Did he rush it? Not "did the menu appear a moment ago" — how much of the
   * evening had actually happened when he asked. Deciding not to ask is never
   * rushing it.
   */
  get rushedIt() {
    if (this.flags.invitation === 'none' || this.flags.invitation === null) return false;
    return (this.askedAfter ?? Infinity) < RUSHED_UNDER;
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
    /* The optional lines are ticked off by flags that a dozen dialogue
     * effects set directly, so rather than making every one of them report
     * in, the board is simply asked. It repaints only when the answer moves. */
    this.refreshBoard();

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

  /* ---------------------------------------------------------------- */
  /* Checkpoints                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Everything about the evening that a reload has to put back.
   *
   * The first version of this saved the flags and the score and nothing else,
   * which meant a restored evening came back with the right number over a
   * mission that thought it was still standing on the pavement: the state, the
   * rounds already had, and the objective list were all dropped. A checkpoint
   * that does not round-trip is worse than no checkpoint, because it looks like
   * one.
   */
  checkpoint() {
    return {
      state: this.state,
      inState: this.inState,
      elapsed: this.elapsed,
      askedAfter: this.askedAfter,
      roundsDone: [...this.roundsDone],
      flags: { ...this.flags, familyMet: this.flags.familyMet.slice() },
      objectives: this.objectives.map((o) => ({ ...o })),
      notes: this.notes.slice(),
    };
  }

  /**
   * Put it back. Deliberately silent: `onState` is how the mission *arrives*
   * somewhere, and firing it here would restart the arrival conversation, hand
   * out objectives a second time, and re-save the checkpoint being restored.
   * The objective list is repainted, because that is a view rather than an event.
   */
  restore(snap) {
    if (!snap) return false;
    /* A checkpoint comes back through JSON in localStorage, so it is data from
     * outside: a state that is not one of the states is refused rather than
     * installed, because every later comparison is an index into that list. */
    if (snap.state && STATES.includes(snap.state)) this.state = snap.state;
    this.inState = snap.inState ?? 0;
    this.elapsed = snap.elapsed ?? this.elapsed;
    this.askedAfter = snap.askedAfter ?? null;
    this._impatient = 0;
    this.trailing = 0;
    this.roundsDone = new Set(snap.roundsDone ?? []);
    Object.assign(this.flags, snap.flags ?? {});
    if (snap.flags?.familyMet) this.flags.familyMet = snap.flags.familyMet.slice();
    if (snap.objectives) this.objectives = snap.objectives.map((o) => ({ ...o }));
    if (snap.notes) this.notes = snap.notes.slice();
    /* And then derived again from what was just installed, so a checkpoint
     * written before a line existed still comes back with the whole board. */
    this.refreshBoard();
    return true;
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
      + 'of her in four minutes than you managed all night. Big Uncle Lou will ring about this. Lou rings '
      + 'about everything.',
  },
  disaster: {
    title: 'FRONT AND CENTER',
    body: 'She left through the kitchen. Every one of them watched her go and not one of them '
      + 'looked at you, which in that building is a formal statement. The cook you did not tip '
      + 'held the door. Somebody will tell Big Uncle Lou before you get to the car.',
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
