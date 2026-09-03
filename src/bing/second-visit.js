import { applyBingVoiceCues } from './script.js';
import { HOTDOG_STAGED_LINES, hotDogBeatReactionLine } from './hotdog-room-voices.js';
import { SHUBENATOR_SIGNATURE_TAKES } from '../core/shubenator-signature.js';

export const SECOND_VISIT_CLEANUP_TASKS = Object.freeze([
  'bathrooms',
  'cleaning_kit',
  'missing_evidence',
  'final_sweep',
]);

/**
 * What each cleanup task is owed before it can happen.
 *
 * Lou's final sweep is the LAST thing that happens in the club, and it was the
 * last thing only because one interaction in hotdog-main.js happened to check
 * the other three first. Every other caller -- a preview checkpoint replaying
 * the tasks, a future beat, a debug jump -- walked straight past that check and
 * could close the sweep with the bathrooms unchecked and HotDog's jewellery
 * still on the carpet. The order is a property of the mission, so it lives with
 * the mission and not with one button.
 */
const CLEANUP_PREREQUISITES = Object.freeze({
  final_sweep: Object.freeze(['bathrooms', 'cleaning_kit', 'missing_evidence']),
});

/** Which prerequisites a cleanup task is still waiting on. Empty means go. */
export function pendingCleanupPrerequisites(task, done = new Set()) {
  return (CLEANUP_PREREQUISITES[task] ?? []).filter((id) => !done.has(id));
}

/* `bathrooms` is a WITNESS check, and the label now says so.
 *
 * Owner, 2026-08-19: "the objective sending the player into the men's room
 * after the murder makes no sense." As "check the men's room" it read as
 * cleaning a toilet nobody had bled in. What it actually is is the other half
 * of Lou's lockdown -- he has just told a room full of people that nobody
 * leaves, and the one door in this building somebody could be standing behind
 * is that one. (Eric's camera battery is behind the cistern, which is the
 * second reason.) The task itself cannot be dropped: the campaign's own
 * `BADA_BING_TWO_CLEANUP_TASKS` in src/core/bada-bing-two-story.js requires
 * all four before the club can be banked, and that file is not this pass's.
 */
const CLEANUP_LABELS = Object.freeze({
  bathrooms: 'Clear the men\'s room — nobody else is in this building',
  cleaning_kit: 'Retrieve Stove\'s Cleaning Kit from storage',
  missing_evidence: 'Find HotDog\'s missing cufflink and lapel pin',
  final_sweep: 'Perform Lou\'s final evidence sweep — the circled boards where Billy fell',
});

/**
 * THE ORDER OF THE NIGHT.
 *
 * Rewritten 2026-08-19 to the owner's hierarchy: Billy is killed, the cleanup
 * begins, the player helps wrap the body, picks it up, carries it out, the
 * body is disposed of, THEN he reports to Lou -- and only once he has done
 * that does the final evidence sweep become an objective at all. `debrief`
 * and `sweep` are the two states that spine needed; nothing else in the room
 * is allowed to close the sweep early, which is why they are states rather
 * than a flag on one interaction.
 */
const STATES = Object.freeze([
  'lot',
  'party',
  'performance',
  'tension',
  'attack',
  'cleanup',
  'body-ready',
  'debrief',
  'sweep',
  'done',
]);

/** Party beats a player has to actually enjoy before the set is offered. */
export const PARTY_BEATS_BEFORE_THE_SET = 3;

/**
 * Lou's old compatibility line names the murder, so it is only safe after the
 * attack has actually begun. Before that, wandering into the office gets his
 * already-recorded stage redirect instead of spoiling the party escalation.
 */
export function secondVisitLouStartNode(state) {
  if (state === 'attack') return 'enter';
  if (['cleanup', 'body-ready', 'debrief', 'sweep', 'done'].includes(state)) return 'cleanup';
  return 'hang';
}

/**
 * The authored spine of the closed-party sequence. The runtime owns timing,
 * camera emphasis and animation; this data owns the words and named reactions
 * so the scene can be verified without rendering it.
 */
export function buildHotDogPartySequence() {
  const signature = SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath;
  const sequence = [
    { phase: 'performance', who: 'Shubenator', line: 'Club is closed, glasses are full. Hog Mama, save us from one another.', cue: 'vo.bing2.shubenator.intro', seconds: 3.2 },
    { phase: 'performance', who: 'Hog Mama', line: 'Billy HotDog comes home after eight months and asks if we still water the liquor. Billy, you drank hand sanitizer in county.', cue: 'vo.bing2.hogmama.set.1', seconds: 4.4, reaction: 'numbskull-early-laugh' },
    /* SNOW, not "Lawnmower". Lawnmower is his nickname and the casting table
     * has always resolved both names to one body and one voice -- but the
     * subtitle put a name on screen that belongs to nobody the player ever
     * meets, over a man standing there called Snow. Same words, same
     * recording (`vo.bing2.lawnmower.heckle`), the right name under it. */
    { phase: 'performance', who: 'Snow', line: 'It was name-brand sanitizer!', cue: 'vo.bing2.lawnmower.heckle', seconds: 2.2, reaction: 'gratin-choke' },
    { phase: 'performance', who: 'Hog Mama', line: 'Look at Lou smiling. That is not joy. That is a landlord seeing the deposit is already gone.', cue: 'vo.bing2.hogmama.set.2', seconds: 4.3, reaction: 'ape-laugh' },
    { phase: 'performance', who: 'Billy HotDog', line: 'Do the one about Ape and the brush!', cue: 'vo.bing2.hotdog.interrupt', seconds: 2.4, reaction: 'lou-warning-look' },
    { phase: 'performance', who: 'Hog Mama', line: 'I do comedy, baby. Archaeology is down the street.', cue: 'vo.bing2.hogmama.set.3', seconds: 3.5, reaction: 'eric-recording' },
    { phase: 'performance', who: 'Hog Mama', line: 'Welcome home, Billy. We missed you exactly as much as the judge required.', cue: 'vo.bing2.hogmama.set.4', seconds: 3.8, action: 'performance-finish' },

    { phase: 'tension', who: 'Billy HotDog', line: 'Ape used to brush the old guys before meetings. Collar to tail. Go find your little fur brush.', cue: 'vo.bing2.hotdog.bully.1', seconds: 4.5, reaction: 'room-laugh' },
    { phase: 'tension', who: 'Ape', line: 'Old story, Billy. Let it stay old.', cue: 'vo.bing2.ape.warn.1', seconds: 3.0 },
    { phase: 'tension', who: 'Big Uncle Lou', line: 'Eat your cake, HotDog. Gratin threatened three people for that icing.', cue: 'vo.bing2.lou.redirect', seconds: 3.5 },
    { phase: 'tension', who: 'Billy HotDog', line: 'Gratin protects food, Eric protects that camera, and Ape protects a fur brush. Everybody found a calling.', cue: 'vo.bing2.hotdog.bully.2', seconds: 4.6 },
    { phase: 'tension', who: 'Ape', line: 'I asked you once.', cue: 'vo.bing2.ape.warn.2', seconds: 2.2 },
    { phase: 'tension', who: 'Billy HotDog', line: 'Then ask me with the brush in your hand.', cue: 'vo.bing2.hotdog.bully.3', seconds: 3.0, action: 'ape-leaves' },
    { phase: 'tension', who: 'Rippinflow', line: 'He didn\'t leave. He went quiet.', cue: 'vo.bing2.rippin.quiet', seconds: 3.1 },
    { phase: 'tension', who: 'Ape', line: 'My fault. Fresh bottle. We are good.', cue: 'vo.bing2.ape.return', seconds: 3.1, action: 'ape-returns' },
    { phase: 'tension', who: 'Billy HotDog', line: 'There he is. Knew you\'d remember your place.', cue: 'vo.bing2.hotdog.last', seconds: 3.0 },

    {
      phase: 'attack', who: 'Ape', line: 'Here\'s your fucking fur brush, HotDog.',
      cue: 'vo.bing2.ape.fur_brush',
      direction: 'Low, controlled fury; close and personal, not shouted. Let “fur brush” land hard.',
      seconds: 2.8, action: 'begin-beating',
    },
    { phase: 'attack', who: 'Shubenator', line: 'Music. Right. Sorry.', cue: 'vo.bing2.shubenator.music', seconds: 2.0, action: 'music-cut' },
    {
      phase: 'aftermath', who: 'Shubenator', line: signature.text,
      cue: signature.cue, direction: signature.direction, seconds: 2.4,
      reaction: 'shubenator-aftermath',
    },
    { phase: 'aftermath', who: 'Big Uncle Lou', line: 'Nobody leaves. Congratulations, everybody. You are all involved now.', cue: 'vo.bing2.lou.lockdown', seconds: 4.0, action: 'cleanup-start' },
    { phase: 'aftermath', who: 'Aubbie', line: 'The bar, yes. Ape requires a specialist.', cue: 'vo.bing2.aubbie.bar', seconds: 3.0, action: 'release-cutscene' },
    { phase: 'handoff', who: 'Big Uncle Lou', line: 'Snow takes HotDog. Prospect goes with him. Bury this problem, then handle the Motel, room twelve.', cue: 'vo.bing2.lou.handoff', seconds: 4.4 },
    { phase: 'handoff', who: 'Prospect', line: 'What is at room twelve?', cue: 'vo.bing2.prospect.motel', seconds: 2.3 },
    { phase: 'handoff', who: 'Snow', line: 'Not here. And not before the graveyard.', cue: 'vo.bing2.snow.not-here', seconds: 3.0 },
  ];
  return sequence.map((beat) => {
    // A tense scene still needs silence. These pauses let reaction animation,
    // eyelines and the hit aftermath register before the next line starts.
    const quiet = beat.phase === 'tension' ? 0.55
      : beat.phase === 'attack' ? 0.42
        : beat.phase === 'aftermath' ? 0.34
          : 0.22;
    /* A beat with a named reaction now has words behind it, and those words
     * belong in the silence AFTER the line rather than on top of it. Widen
     * exactly this beat's gap by the reaction's own length so the room can
     * answer Hog Mama without anybody being talked over, and so the same data
     * keeps working if a reaction is later rewritten longer or shorter. */
    const answer = hotDogBeatReactionLine(beat.reaction);
    return {
      ...beat,
      gapAfter: beat.gapAfter ?? (answer ? quiet + answer.seconds + 0.3 : quiet),
    };
  });
}

export class SecondVisitMission {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'lot';
    this.inside = false;
    this.objectives = [];
    this.notes = [];
    this.assignment = null;
    this.hands = 0;
    this.spins = 0;
    this.drinks = 0;
    this.waited = 0;
    this.associateSent = false;
    this.flags = {
      bouncerCleared: true,
      heardAboutCar: false,
      sawCar: false,
      toldLou: false,
      gotPackage: false,
      inspected: 0,
      jackpot: false,
      leftByRear: false,
      alarmTripped: false,
      alarmDisabled: true,
      secretPanel: false,
      plateRead: false,
      attackResolved: false,
      bodyWrapped: false,
      bodyCarried: false,
      bodyLoaded: false,
      louDebriefed: false,
      departing: false,
    };
    this.cleanup = new Set();
    /* How much of the party the player has actually had. The Prospect is at a
     * party; the first objective is to be at it. */
    this.partyBeats = new Set();
    this.addObjective('party', 'Enjoy the party');
  }

  get readyToLeave() {
    return this.assignment !== null
      && this.flags.attackResolved
      && this.flags.bodyWrapped
      && this.flags.bodyLoaded
      && SECOND_VISIT_CLEANUP_TASKS.every((task) => this.cleanup.has(task));
  }

  setState(next) {
    if (this.state === next) return;
    const order = STATES.indexOf(next);
    if (order < 0 || order < STATES.indexOf(this.state)) return;
    this.state = next;
    this.hooks.onState?.(next, this);
  }

  addObjective(id, text) {
    if (this.objectives.some((objective) => objective.id === id)) return;
    this.objectives.push({ id, text, done: false });
    this.hooks.onObjective?.(this.objectives);
  }

  complete(id) {
    const objective = this.objectives.find((entry) => entry.id === id);
    if (!objective || objective.done) return;
    objective.done = true;
    this.hooks.onObjective?.(this.objectives);
  }

  note(text) {
    if (this.notes.includes(text)) return;
    this.notes.push(text);
    this.hooks.onNote?.(text);
  }

  enteredClub() {
    this.inside = true;
    this.setState('party');
  }

  /**
   * The Prospect actually having the evening.
   *
   * Owner, 2026-08-19: the first objective is ENJOY THE PARTY, and the player
   * gets to be in the room before Billy's night starts. So the stage is not
   * an objective the moment he walks in -- it arrives once he has had some of
   * the party. Every id is a real thing he did (a drink with Booski, a plate
   * off Sauce, a conversation, the cards), counted once each so standing in
   * front of the same man twice is not three quarters of a party.
   */
  enjoyedParty(beat) {
    if (typeof beat !== 'string' || !beat.trim()) return false;
    if (this.state !== 'party' || this.partyBeats.has(beat)) return false;
    this.partyBeats.add(beat);
    if (this.partyBeats.size >= PARTY_BEATS_BEFORE_THE_SET) this.offerTheSet();
    return true;
  }

  /** The set becomes the next thing. Idempotent; several paths reach it. */
  offerTheSet() {
    if (this.state !== 'party' || this.objectives.some((o) => o.id === 'performance')) return false;
    this.complete('party');
    this.addObjective('performance', 'Start Hog Mama\'s set at the stage controls');
    return true;
  }

  startPerformance() {
    if (this.state !== 'party') return false;
    /* A player who walks straight to the controls has decided he has had
     * enough party, and the objective card must not be left holding an open
     * "enjoy the party" behind a set that is already running. */
    this.offerTheSet();
    this.complete('performance');
    this.setState('performance');
    this.addObjective('watch', 'Stay for Hog Mama\'s routine');
    return true;
  }

  finishPerformance() {
    if (this.state !== 'performance') return false;
    this.complete('watch');
    this.setState('tension');
    this.addObjective('stay-close', 'Stay close while HotDog needles Ape');
    return true;
  }

  startAttack() {
    if (this.state !== 'tension') return false;
    this.complete('stay-close');
    this.setState('attack');
    this.addObjective('attack', 'Stay clear while Ape handles HotDog');
    return true;
  }

  /** Which cleanup tasks are the FLOOR's, as opposed to Lou's closing sweep. */
  get roomTasks() {
    return SECOND_VISIT_CLEANUP_TASKS.filter((task) => task !== 'final_sweep');
  }

  get roomClean() {
    return this.roomTasks.every((task) => this.cleanup.has(task));
  }

  resolveAttack() {
    if (this.state !== 'attack') return false;
    this.flags.attackResolved = true;
    this.complete('attack');
    this.setState('cleanup');
    /* Only the floor's three. The final sweep is not an objective yet and
     * cannot be: Lou hands it out himself once Billy is out of the building,
     * which is the whole point of the reordering. */
    for (const task of this.roomTasks) {
      this.addObjective(`cleanup.${task}`, CLEANUP_LABELS[task]);
    }
    return true;
  }

  completeCleanup(task) {
    if (!SECOND_VISIT_CLEANUP_TASKS.includes(task)) return false;
    /* The sweep is the last thing that happens in this building and it only
     * exists once Lou has asked for it -- state `sweep`, which nothing but
     * `debriefLou()` can reach. The other three belong to the cleanup floor. */
    const wanted = task === 'final_sweep' ? 'sweep' : 'cleanup';
    if (this.state !== wanted) return false;
    /* Out of order is refused here rather than at the button, so no caller can
     * finish the sweep over an unfinished club. */
    if (pendingCleanupPrerequisites(task, this.cleanup).length) return false;
    this.cleanup.add(task);
    this.complete(`cleanup.${task}`);
    if (task !== 'final_sweep' && this.roomClean) {
      this.addObjective('wrap', 'Help Rippin and Aubbie wrap HotDog');
    }
    return true;
  }

  wrapBody() {
    if (this.state !== 'cleanup' || !this.roomClean) return false;
    this.flags.bodyWrapped = true;
    this.complete('wrap');
    this.setState('body-ready');
    this.addObjective('carry', 'Pick Billy up and carry him out through the store room');
    return true;
  }

  /**
   * The Prospect takes the weight himself.
   *
   * The wrapped body is carried, not teleported to a loading pad, because the
   * graveyard already makes the player carry this exact man across a field
   * (`src/graveyard/world.js`) and doing it twice is the point -- he is the
   * one holding Billy from the bar boards to the hole.
   */
  carryBody() {
    if (this.state !== 'body-ready' || !this.flags.bodyWrapped || this.flags.bodyCarried) return false;
    this.flags.bodyCarried = true;
    this.complete('carry');
    this.addObjective('load', 'Load Billy into Snow\'s car at the service door');
    return true;
  }

  assign(assignment) {
    if (this.state !== 'body-ready'
      || !this.flags.bodyCarried
      || typeof assignment !== 'string'
      || !assignment.trim()) return false;
    if (this.assignment !== null) return this.assignment === assignment;
    this.assignment = assignment;
    this.flags.bodyLoaded = true;
    this.complete('load');
    this.setState('debrief');
    this.addObjective('debrief', 'Report to Big Uncle Lou');
    return true;
  }

  /** Lou, with the body gone, hands out the sweep. Nothing else can. */
  debriefLou() {
    if (this.state !== 'debrief') return false;
    this.flags.louDebriefed = true;
    this.complete('debrief');
    this.setState('sweep');
    this.addObjective('cleanup.final_sweep', CLEANUP_LABELS.final_sweep);
    return true;
  }

  /**
   * The ending cutscene has played, inside, and the only thing left is the
   * service exit. Called by the runtime when the handoff beats finish.
   */
  beginDeparture() {
    if (!this.readyToLeave || this.flags.departing) return false;
    this.flags.departing = true;
    this.addObjective('leave', 'Leave through the service exit.');
    return true;
  }

  finish() {
    if (!this.readyToLeave) return false;
    this.complete('leave');
    this.setState('done');
    return 'graveyard';
  }

  ending() { return 'graveyard'; }
  handPlayed() { this.hands++; }
  spun() { this.spins++; }
  drank() { this.drinks++; }
  jackpot() { this.flags.jackpot = true; }
  sendAssociate() {}
  reachedHallway() {}
  enteredOffice() {}
  leftOffice() {}
  backInLot() {}

  update(dt) {
    if (!this.inside || this.state !== 'party') return;
    this.waited += dt;
    if (this.waited >= 90 && !this._partyNudge) {
      this._partyNudge = true;
      /* Ninety seconds in the room is a party by anybody's measure, so the
       * set becomes available whether or not the player took the shot, the
       * plate and the conversation. Nobody is locked out of their own scene
       * by an optional drink. */
      this.offerTheSet();
      /* He is standing twenty feet away, so he says it. A page that can give
       * him a body takes `onNudge` and lets him shout it in his own voice;
       * the older club page has no actor for him on this channel and falls
       * back to the toast, which is why the text keeps its "NAME: words"
       * shape -- that is what main.js splits a named shout on.
       *
       * 'shout', not 'text'. The club's message channel is otherwise Lou
       * texting from the back office, and announcing a man standing at the
       * stage with a phone alert is the wrong instrument. */
      const nudge = HOTDOG_STAGED_LINES.shubenatorStageNudge;
      if (this.hooks.onNudge) this.hooks.onNudge(nudge);
      else this.hooks.onMessage?.(`SHUBENATOR: ${nudge.line}`, 'shout');
    }
  }
}

/**
 * Temporary compatibility for the shared Lou interaction. The second visit
 * no longer begins in his office; the actual handoff is part of the party
 * director and this tree only explains that boundary if the player wanders in.
 */
export function buildSecondVisitLouScript() {
  return applyBingVoiceCues({ lou: {
    enter: {
      who: 'Lou',
      line: 'Office is closed, Prospect. Party is out front. Try not to miss the murder.',
      hold: 3.2,
    },
    hang: {
      who: 'Lou',
      line: 'Out front. Hog Mama is waiting on the stage controls.',
      hold: 2.8,
    },
    cleanup: {
      who: 'Lou',
      line: 'Nobody leaves. Congratulations, everybody. You are all involved now.',
      cue: 'vo.bing2.lou.lockdown',
      hold: 4.0,
    },
  } }).lou;
}
