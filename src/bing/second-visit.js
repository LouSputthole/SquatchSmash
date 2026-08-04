import { applyBingVoiceCues } from './script.js';
import { HOTDOG_STAGED_LINES, hotDogBeatReactionLine } from './hotdog-room-voices.js';
import { SHUBENATOR_SIGNATURE_TAKES } from '../core/shubenator-signature.js';

export const SECOND_VISIT_CLEANUP_TASKS = Object.freeze([
  'bathrooms',
  'cleaning_kit',
  'missing_evidence',
  'final_sweep',
]);

const CLEANUP_LABELS = Object.freeze({
  bathrooms: 'Check both bathrooms and the back hall',
  cleaning_kit: 'Retrieve Aubbie\'s cleanup kit from storage',
  missing_evidence: 'Find HotDog\'s missing cufflink and lapel pin',
  final_sweep: 'Perform Lou\'s final evidence sweep',
});

const STATES = Object.freeze([
  'lot',
  'party',
  'performance',
  'tension',
  'attack',
  'cleanup',
  'body-ready',
  'done',
]);

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
    { phase: 'performance', who: 'Lawnmower', line: 'It was name-brand sanitizer!', cue: 'vo.bing2.lawnmower.heckle', seconds: 2.2, reaction: 'gratin-choke' },
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
      bodyLoaded: false,
    };
    this.cleanup = new Set();
    this.addObjective('party', 'Join the closed party at the main bar');
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
    this.complete('party');
    this.setState('party');
    this.addObjective('performance', 'Start Hog Mama\'s set at the stage controls');
  }

  startPerformance() {
    if (this.state !== 'party') return false;
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

  resolveAttack() {
    if (this.state !== 'attack') return false;
    this.flags.attackResolved = true;
    this.complete('attack');
    this.setState('cleanup');
    for (const task of SECOND_VISIT_CLEANUP_TASKS) {
      this.addObjective(`cleanup.${task}`, CLEANUP_LABELS[task]);
    }
    return true;
  }

  completeCleanup(task) {
    if (this.state !== 'cleanup' || !SECOND_VISIT_CLEANUP_TASKS.includes(task)) return false;
    this.cleanup.add(task);
    this.complete(`cleanup.${task}`);
    if (SECOND_VISIT_CLEANUP_TASKS.every((id) => this.cleanup.has(id))) {
      this.addObjective('wrap', 'Help Rippin wrap HotDog');
    }
    return true;
  }

  wrapBody() {
    if (this.state !== 'cleanup'
      || !SECOND_VISIT_CLEANUP_TASKS.every((task) => this.cleanup.has(task))) return false;
    this.flags.bodyWrapped = true;
    this.complete('wrap');
    this.setState('body-ready');
    this.addObjective('load', 'Follow the service-exit arrows and load HotDog into Snow\'s car');
    return true;
  }

  assign(assignment) {
    if (this.state !== 'body-ready'
      || typeof assignment !== 'string'
      || !assignment.trim()) return false;
    if (this.assignment !== null) return this.assignment === assignment;
    this.assignment = assignment;
    this.flags.bodyLoaded = true;
    this.complete('load');
    return true;
  }

  finish() {
    if (!this.readyToLeave) return false;
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
  } }).lou;
}
