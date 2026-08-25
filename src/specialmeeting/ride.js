/**
 * THE SPECIAL MEETING — the sequence that walks the script.
 *
 * `script.js` is what is said. This is when, in what order, and what happens
 * to the car and the four men while it is being said. It is deliberately free
 * of THREE, of the DOM and of the campaign: everything it wants to happen in
 * the world it asks for through callbacks, so the whole scene can be played
 * start to finish in a test with nothing rendered.
 *
 * ## The one property this file exists to hold
 *
 * There is no way out of the front seat. The hub at SM-110 offers eight ways
 * to refuse and every one of them comes back to the hub; the seat is always on
 * the list; nobody ever escalates and nothing is ever taken away except the
 * question he has already asked. `chose()` cannot reach a state where the
 * scene continues and he is not in that seat — `#seated` is written in
 * exactly one place.
 *
 * ## Timing
 *
 * A line holds for as long as its recording, when one exists, and for a read
 * estimate when it does not — the same rule `src/core/phone.js` uses, so the
 * whole scene is playable at the right pace before a single mp3 lands. Beats
 * add `holdAfter` on top of that where the script asks for a pause, and the
 * silences are their own beats with their own clocks because the silences are
 * the scene.
 */
import {
  BEATS, HUB_ID, SEAT_ID, beat,
} from './script.js';

/** Unrecorded lines read at roughly this pace. Lifted from `phone.js`. */
const READ_BASE = 1.4;
const READ_PER_CHAR = 0.045;

/** The gap between one line ending and the next beginning. Not zero. */
const LINE_GAP = 0.45;

/** Where the scene is, in the coarse terms anything outside it cares about. */
export const PHASES = Object.freeze([
  'kerb',        // standing on the pavement, the car running, the door open
  'seated',      // in the front passenger seat, door shut
  'driving',     // under way, including the black
  'spur',        // stopped in the woods, engine off
  'trail',       // walking in
  'handoff',     // the trees have opened
]);

function readSeconds(text) {
  return READ_BASE + READ_PER_CHAR * String(text ?? '').length;
}

/**
 * Drive the scene.
 *
 * Every option is a callback and every callback is optional, so a test can
 * take the two it cares about and let the rest be nothing.
 *
 *   onLine(line, beat)       a spoken line begins. Return the take's length in
 *                            seconds to override the read estimate.
 *   onStage(line, beat)      a stage direction: something happens, nobody speaks
 *   onBeat(beat, previous)   a beat begins
 *   onChoice(options, beat)  put these on screen; null closes the list
 *   onPhase(phase)           the scene has moved
 *   onSeated()               he is in the front seat and the door is shut
 *   onBlackout() / onFadeIn(seconds)
 *   canHandoff()             whether the player has actually walked the trail
 *   onHandoff()              the trees have opened; leave for the Initiation
 */
export function createRideSequence({
  onLine = null,
  onStage = null,
  onBeat = null,
  onChoice = null,
  onPhase = null,
  onSeated = null,
  onBlackout = null,
  onFadeIn = null,
  canHandoff = () => true,
  onHandoff = null,
  takeSeconds = null,
} = {}) {
  let current = null;
  let lineIndex = 0;
  let hold = 0;
  let open = null;              // the options on screen, or null
  let choiceClock = 0;
  let finished = false;
  let phase = 'kerb';

  /* Hub bookkeeping. `declines` unlocks the later questions; `spent` is why a
   * question he has already asked is not still on the list. The seat is never
   * spent and never locked: it is on the table from the first frame to the
   * last, and taking it is always the shortest way out of the conversation. */
  let declines = 0;
  const spent = new Set();

  /* A player answer spoken over the top of a branch that does not restate it.
   * The branch cannot begin until he has finished saying it, so it waits here
   * for one hold rather than being jammed into the same frame. */
  let pendingBeat = null;

  let seated = false;
  let rearSwapped = false;
  let trunkOpen = false;
  let blackedOut = false;

  function setPhase(next) {
    if (phase === next) return;
    phase = next;
    onPhase?.(phase);
  }

  function optionKey(b, option) { return `${b.id}#${option.index}`; }

  function availableOptions(b) {
    return b.options.filter((option) => {
      if (option.unlocksAfter > declines) return false;
      if (option.accepts || option.leaves) return true;
      return !spent.has(optionKey(b, option));
    });
  }

  function openChoice(b) {
    open = availableOptions(b);
    choiceClock = 0;
    onChoice?.(open, b);
  }

  function closeChoice() {
    if (!open) return;
    open = null;
    onChoice?.(null, current);
  }

  function playLine(b, line) {
    if (!line.spoken) {
      onStage?.(line, b);
      if (line.seats) {
        seated = true;
        setPhase('seated');
        onSeated?.();
      }
      if (line.swapRear) rearSwapped = true;
      if (line.opensTrunk) trunkOpen = true;
      if (line.closesTrunk) trunkOpen = false;
      return Math.max(0, line.holdSeconds ?? 0);
    }
    const reported = onLine?.(line, b);
    const spoken = Number.isFinite(reported) && reported > 0
      ? reported
      : (takeSeconds?.(line.cue) ?? readSeconds(line.text));
    return spoken + LINE_GAP + (line.holdAfter ?? 0);
  }

  function enter(id) {
    const previous = current;
    const b = beat(id);
    current = b;
    lineIndex = 0;
    hold = 0;
    closeChoice();

    /* The road is visible from its first frame now. Act three, not a blackout,
     * is the durable phase boundary between the kerb and the drive. */
    if (b.act === 3 && phase === 'seated') setPhase('driving');
    if (b.kind === 'blackout') {
      blackedOut = true;
      onBlackout?.(b.lines[0]?.fadeSeconds ?? 0);
    }
    if (b.kind === 'fade') { blackedOut = false; onFadeIn?.(b.lines[0]?.fadeSeconds ?? 3); }
    if (b.act === 4 && phase === 'driving') setPhase('spur');
    if (b.id === 'SM-530') setPhase('trail');

    onBeat?.(b, previous);
    return b;
  }

  function advance() {
    if (pendingBeat) {
      const to = pendingBeat;
      pendingBeat = null;
      enter(to);
      /* Fall through: the branch's first line starts in this same step. */
    }
    const b = current;
    if (!b) return;
    if (lineIndex < b.lines.length) {
      hold = playLine(b, b.lines[lineIndex]);
      lineIndex += 1;
      return;
    }
    if (b.options.length) { openChoice(b); return; }
    if (b.kind === 'handoff') {
      /* The lines can finish while the player is still standing beside the
       * Lincoln. Keep the authored beat live until the world reports that he
       * has actually walked the trail; a timer is not evidence of movement. */
      if (!canHandoff()) return;
      finished = true;
      setPhase('handoff');
      onHandoff?.();
      return;
    }
    if (b.next) { enter(b.next); advance(); return; }
    finished = true;
  }

  /* The silence has a clock and the hub does not. Numbskull is holding a car
   * door and has all night; the woods, on the other hand, are twenty-two
   * seconds of nobody saying anything, and if the player never breaks it the
   * scene takes the branch where nobody rescues it. */
  function silenceTimeout(b) {
    if (b.kind !== 'silence') return null;
    const quiet = b.options.find((option) => option.silent);
    return quiet ? { seconds: b.holdSeconds || 22, option: quiet } : null;
  }

  const seq = {
    /** Start at the kerb, or reconstruct an explicit persisted scene phase. */
    begin(id = 'SM-100', { phase: restoredPhase = null } = {}) {
      finished = false;
      if (restoredPhase !== null) {
        if (!PHASES.includes(restoredPhase)) {
          throw new Error(`Unknown Special Meeting phase: ${restoredPhase}`);
        }
        /* `seated` records that the mandatory front-seat event occurred; it
         * remains true after he gets out and is part of the sequence proof. */
        if (restoredPhase !== 'kerb') seated = true;
        setPhase(restoredPhase);
      }
      enter(id);
      advance();
      return seq;
    },

    update(dt) {
      if (finished || !current) return seq;
      if (open) {
        const timeout = silenceTimeout(current);
        if (!timeout) return seq;
        choiceClock += dt;
        if (choiceClock >= timeout.seconds) seq.choose(timeout.option.index);
        return seq;
      }
      hold -= dt;
      if (hold <= 0) advance();
      return seq;
    },

    /**
     * Take an option, by its 1-based number.
     *
     * Refusing costs him nothing except the question: nobody's tone changes,
     * nobody moves, and the door is still open. It does unlock the next thing
     * he can think of to say, which is the only way this conversation ever
     * gets longer.
     */
    choose(index) {
      if (!open) return seq;
      const option = open.find((o) => o.index === index) ?? open[0];
      if (!option) return seq;
      const b = current;
      if (!option.accepts && !option.leaves) {
        spent.add(optionKey(b, option));
        if (b.id === HUB_ID) declines += 1;
      }
      closeChoice();
      /* His own words, when the branch does not restate them. */
      if (option.cue) {
        const said = onLine?.({
          spoken: true, who: 'PROSPECT', voice: option.voice, text: option.text, cue: option.cue,
        }, b);
        hold = (Number.isFinite(said) && said > 0 ? said : readSeconds(option.text)) + LINE_GAP;
        pendingBeat = option.to;
        return seq;
      }
      enter(option.to);
      advance();
      return seq;
    },

    /** Skip whatever is holding. Used by the pause menu's resume, and by tests. */
    skip() {
      if (open) return seq;
      hold = 0;
      advance();
      return seq;
    },

    get beatId() { return current?.id ?? null; },
    get beat() { return current; },
    get options() { return open; },
    get phase() { return phase; },
    get finished() { return finished; },
    get seated() { return seated; },
    get rearSwapped() { return rearSwapped; },
    get trunkOpen() { return trunkOpen; },
    get blackedOut() { return blackedOut; },
    get declines() { return declines; },
  };

  return seq;
}

/**
 * Play the whole scene with nobody watching.
 *
 * The branch test uses this: pick every option it is ever offered, in order,
 * and prove the thing still ends in the front seat and at the treeline. It is
 * also the cheapest way to find a beat whose `next` points at nothing.
 */
export function walkScene({ pick = () => 1, maxSteps = 4000, dt = 0.5 } = {}) {
  const visited = new Set();
  const said = [];
  let choices = 0;
  const seq = createRideSequence({
    onBeat: (b) => visited.add(b.id),
    onLine: (line) => { said.push(line.cue); return 0.2; },
  });
  seq.begin();
  for (let step = 0; step < maxSteps && !seq.finished; step += 1) {
    if (seq.options) {
      choices += 1;
      seq.choose(pick(seq.options, seq.beat, choices));
    } else {
      seq.update(dt);
    }
  }
  return {
    finished: seq.finished,
    seated: seq.seated,
    phase: seq.phase,
    beatId: seq.beatId,
    visited,
    said,
    choices,
  };
}

/** Every beat id the script defines, for a test that wants to prove coverage. */
export const ALL_BEAT_IDS = Object.freeze(BEATS.map((b) => b.id));
export { HUB_ID, SEAT_ID };
