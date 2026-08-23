import {
  SEQUENCES, OBJECTIVES, INSTRUCTIONS, TARGET_CALLOUTS, LAB_DOOR_CODE,
  SCIENTIST_INDEX, gainForVoice,
} from '../script.js';
import { DialogueController } from './DialogueController.js';
import { SilentSquatchStateMachine, S, BEAT_OF } from './SilentSquatchStateMachine.js';

/**
 * PROJECT SILENT SQUATCH — the mission.
 *
 * This file is the mission and nothing else: no THREE, no meshes, no lights,
 * no DOM. It drives the laboratory through the API the environment build
 * publishes (see the `lab` contract below), plays the writing in
 * ../script.js, raises the HUD's objectives and instructions, and records
 * enough of what happened for a verifier to prove it.
 *
 * THE PLAYER DOES EVERY ACTION. The spec is explicit that this must not become
 * a cutscene, and the reason is not pacing:
 *
 *   > The actions make the Prospect responsible for what happened. He is no
 *   > longer merely witnessing the Squatch family's crimes. He is becoming
 *   > part of the machinery.
 *
 * So every one of these is a method on this object that only the player's own
 * input calls, and each of them refuses politely at every other moment:
 * `placeCaseOnDesk`, `takeCaseBack`, `pressBustSwitch`, `deliverCase`,
 * `enterCode`, `shootAubbie`, `pullSilentNight`, `leave`. The mission never
 * performs any of them for him and there is no timeout that does it either.
 *
 * THE LAB CONTRACT, verbatim from the brief. The environment build owns all of
 * it; nothing in this file constructs any of it:
 *
 *   lab.openDoor() / lab.closeDoor() / lab.lockDoor()   lab.doorLocked
 *   lab.keypad.arm() / lab.keypad.enter(s)  -> true on '6969'
 *   lab.transferDrawer.send()
 *   lab.core.begin() / lab.core.complete()  lab.monitors.setPurple()
 *   lab.gas.start()   lab.gas.density        // 0..1
 *   lab.scientists    // 6, index 0 = Aubbie; .say(cue) .panic() .coughing()
 *                     //                      .crawl() .collapse() .handprint()
 *   lab.muffled       // true once the door locks
 *   lab.glassAudio    // route scientist lines through this
 *   lab.hiddenWall.open()   lab.lifeSigns
 *
 * Everything beyond that contract is treated as optional and called with `?.`
 * — a lab that grows a `scientists[i].cover()` gets used, a lab that has not
 * grown one yet still plays. `mission/contract-lab.js` is a complete reference
 * implementation of the contract and is what the mission's own tests drive.
 */

/**
 * The gas, in the spec's order:
 *   confusion → panic → covering their mouths → coughing and choking →
 *   slamming the glass → crawling for the door → collapsing one by one.
 *
 * `at` is the `lab.gas.density` (0..1) at which the stage begins, so the
 * pacing belongs to the gas rather than to a timer that could run ahead of
 * what the player can see.
 */
const GAS_STAGES = Object.freeze([
  Object.freeze({ id: 'confusion', at: 0.02, lines: 'gasConfusion', act: null }),
  Object.freeze({ id: 'panic', at: 0.16, lines: 'gasPanic', act: 'panic' }),
  Object.freeze({ id: 'covering', at: 0.30, lines: 'gasCovering', act: 'cover' }),
  Object.freeze({ id: 'choking', at: 0.46, lines: 'gasChoking', act: 'coughing' }),
  Object.freeze({ id: 'slamming', at: 0.60, lines: 'gasSlamming', act: 'slam' }),
  Object.freeze({ id: 'crawling', at: 0.76, lines: 'gasCrawling', act: 'crawl' }),
  Object.freeze({ id: 'collapsing', at: 0.90, lines: 'gasCollapse', act: null }),
]);

/**
 * Who goes down, in order, and who is last to the glass.
 *
 * Bezmenov first: he never got up, because he told them in March this was
 * coming. Orlova last, because she is the youngest and the strongest and she
 * is the one still on her feet at the glass — which is why the smeared
 * handprint the spec asks for is hers.
 */
const COLLAPSE_ORDER = Object.freeze([
  SCIENTIST_INDEX.BEZMENOV,
  SCIENTIST_INDEX.VETROV,
  SCIENTIST_INDEX.SOKOLOV,
  SCIENTIST_INDEX.MARCHUK,
  SCIENTIST_INDEX.ORLOVA,
]);

/**
 * DeathMegatron, enjoying it (owner playtest, 2026-08-19: *"she is really
 * taking pleasure in the killing of the scientists, making fun of their need
 * to breathe, and laughing at them ... some offensive lines calling them
 * names"*).
 *
 * The brief cast her "completely heartless and cold in this scene", and the
 * pleasure is played INSIDE that register — deadpan doom-voice relish, never a
 * cackle, per docs/TONE-AND-PARODY.md: the cruelty is real and the scene does
 * not wink. The insults stay aimed at what she despises about them — their
 * frailty, their little coats, their embarrassing dependence on air.
 *
 * AUTHORED HERE RATHER THAN IN ../script.js, deliberately and temporarily: a
 * concurrent pass owns script.js tonight, and these lines ride the gassing —
 * this file's own beat. They are line objects in the script's exact shape and
 * they run through the same DialogueController as everything else, so moving
 * them into script.js's `gas` scope later is a cut-and-paste plus a cue
 * rename. The cues live on the sibling `vo.silentnight.` prefix because
 * `vo.silentsquatch.*` is contract-checked against `allSilentSquatchLines()`
 * (tools/mansion-vo.mjs, tests/silent-squatch-voice.test.mjs) and a cue on
 * that prefix that script.js does not author is, correctly, a build failure.
 * The manifest carries them under her existing `deathmegatron` casting.
 *
 * `at` is a `lab.gas.density`, exactly like GAS_STAGES — offset BETWEEN the
 * stages' own thresholds, and each line additionally waits for the dialogue
 * floor to be free (see `#gassing`), so she is reacting to what the room is
 * doing rather than talking over her own scene.
 */
const DMT_GAS_TAUNTS = Object.freeze([
  Object.freeze({
    at: 0.07,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'There it goes. Breathe deep, lab rats. You earned every lungful.',
      cue: 'vo.silentnight.dmt.labrats',
      hold: 3.8,
    }),
  }),
  Object.freeze({
    at: 0.22,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'Look at them go. Little coats. Big hurry.',
      cue: 'vo.silentnight.dmt.littlecoats',
      hold: 3.0,
    }),
  }),
  Object.freeze({
    at: 0.37,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'They’re covering their mouths. Adorable. Air was always their weakness.',
      cue: 'vo.silentnight.dmt.adorable',
      hold: 4.2,
    }),
  }),
  Object.freeze({
    at: 0.52,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'Heh. Needing to breathe. How embarrassing for you.',
      cue: 'vo.silentnight.dmt.embarrassing',
      hold: 3.4,
    }),
  }),
  Object.freeze({
    at: 0.67,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'Knock all you want, pencil-necks. The glass doesn’t do sympathy.',
      cue: 'vo.silentnight.dmt.pencilnecks',
      hold: 3.8,
    }),
  }),
  Object.freeze({
    at: 0.82,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'Crawling. Finally some exercise, eggheads.',
      cue: 'vo.silentnight.dmt.exercise',
      hold: 3.0,
    }),
  }),
  Object.freeze({
    at: 0.95,
    line: Object.freeze({
      speaker: 'DEATHMEGATRON',
      text: 'Shh. Shh, shh, shh. There it is. Silent night.',
      cue: 'vo.silentnight.dmt.silentnight',
      hold: 3.6,
    }),
  }),
]);

/**
 * The level a laboratory body plays a line at with nobody overriding it.
 *
 * The number belongs to `scenes/SilentSquatch.js` (`say()`'s `opts.volume ??
 * 0.9`) and is restated here because this file is now the caller that
 * overrides it — per-voice gain has to be applied to SOMETHING, and applying
 * it to a default the scene owns without saying so is how the two drift apart.
 * If the scene's default moves, this moves with it.
 */
const LAB_BODY_VOLUME = 0.9;

const COLLAPSE_INTERVAL = 1.1;
/** How long the aftermath will wait for the monitor to agree that they are
 * dead before reporting what it actually says. Never a fail state — a lab that
 * lags must not strand the player in a locked room. */
const LIFE_SIGNS_TIMEOUT = 8;

const noop = () => {};

export function createSilentSquatchMission(options = {}) {
  return new SilentSquatchMission(options);
}

class SilentSquatchMission {
  /**
   * @param {object} opts
   * @param {object} opts.lab      the laboratory contract (required)
   * @param {object} [opts.story]  campaign boundary — see silent-squatch-story.js
   * @param {object} [opts.hud]    { setObjective, setInstruction, setCallout }
   * @param {object} [opts.zones]  { id: {x, y?, z, r, verticalTolerance?} }
   *   proximity triggers. Mansion is a stacked house, so authored 3D zones
   *   must not fire through a floor. Legacy harness zones without `y` remain
   *   horizontal-only for backwards compatibility.
   * @param {Function} [opts.onLine]    subtitle in
   * @param {Function} [opts.onLineEnd] subtitle out
   * @param {Function} [opts.onStage]   cosmetic stage directions for the scene
   * @param {Function} [opts.playCue]   `(cue, voice, gain)` — play a dry
   *   (non-muffled) cue by name. `gain` is the speaker's own profile gain
   *   (see `VOICE_GAIN` in ../script.js) and is 1 for everybody without a row.
   * @param {Function} [opts.onCase]    'carry' | 'desk' | 'open' | 'close' | 'slide' | 'table' | 'gone'
   * @param {Function} [opts.onBeat]    (state, beatNumber) whenever a beat starts
   * @param {Function} [opts.canEnterZone] optional organic trigger gate. It is
   *   called after the player's feet enter a zone but before its one-shot id is
   *   consumed. Direct `arrive(id)` calls remain explicit stage/debug commands.
   * @param {Function} [opts.canIdleBark] `(speakerId) => boolean`.
   * @param {Function} [opts.onNpcBark] `(speakerId, kind)` after a zone or idle
   *   bark is actually committed to the dialogue floor.
   */
  constructor({
    lab,
    story = null,
    hud = null,
    zones = null,
    onLine = null,
    onLineEnd = null,
    onStage = null,
    playCue = null,
    onCase = null,
    /** Told when a man in this house puts a weapon in the player's hands.
     * The mission has no idea what a weapon is; see `sidearm.give`. */
    onSidearm = null,
    onBeat = null,
    canEnterZone = null,
    canIdleBark = null,
    onNpcBark = null,
  } = {}) {
    if (!lab) throw new TypeError('the Silent Squatch mission needs a lab');
    this.lab = lab;
    this.story = story;
    this.hud = {
      setObjective: hud?.setObjective?.bind(hud) ?? noop,
      setInstruction: hud?.setInstruction?.bind(hud) ?? noop,
      setCallout: hud?.setCallout?.bind(hud) ?? noop,
    };
    this.zones = zones ? { ...zones } : {};
    this.onStageHook = onStage;
    this.onCase = onCase ?? noop;
    this.onSidearm = onSidearm ?? noop;
    this.onBeat = onBeat ?? noop;
    this.canEnterZone = canEnterZone;
    this.canIdleBark = canIdleBark;
    this.onNpcBark = onNpcBark;

    this.dialogue = new DialogueController({
      onLine,
      onLineEnd,
      onStage: (stage, line) => this.#stage(stage, line),
      playCue: (cue, voice, line) => this.#speak(cue, voice, line, playCue),
    });

    /* ---- what has happened, honestly ---- */
    this.objectiveLog = [];
    this.instructionLog = [];
    this.zonesEntered = new Set();
    this.barked = new Set();
    this.gasStages = [];
    this.glassRouted = 0;
    this.dryRouted = 0;
    this.handprints = 0;
    this.keypadAttempts = [];
    this.wrongCodes = 0;
    this.caseState = 'carried';
    this.caseOnDesk = false;
    this.caseDelivered = false;
    this.caseThroughDrawer = false;
    this.aubbieOutside = false;
    this.aubbieKilled = false;
    this.aubbieKilledSide = null;
    this.aubbieMissedShots = 0;
    /** True once the round has actually landed in him. See `shootAubbie`. */
    this.bloodShed = false;
    /** True once Booski has handed the pistol over at the delivery. */
    this.sidearmGiven = false;
    this.bezmenovTriedHandleFirst = false;
    /* Set by the player's own hands, and read by the beat those hands ran
     * ahead of: a state's enter() must never clobber the sequence an action
     * accepted one frame early has already started. See #at(). */
    this.wallOpened = false;
    this.leaving = false;
    this.reportingToLou = false;
    this.reportedToLou = false;
    this.chairBent = false;
    this.collapsed = [];
    this.lifeSignsAtAftermath = null;
    this.lifeSignsTimedOut = false;
    this.complete = false;

    this.objective = '';
    this.instruction = '';
    this.stall = 0;
    this.stallIndex = 0;
    this.asideIndex = 0;
    this.asideTimer = 0;
    this.collapseTimer = 0;
    this.collapseCursor = 0;
    /** Which of DeathMegatron's gassing taunts fires next, and how long the
     * pending one has been waiting for a gap in the dying. See #gassing. */
    this.tauntCursor = 0;
    this.tauntWait = 0;
    this.aftermathWait = 0;

    this.fsm = new SilentSquatchStateMachine(this.#states(), (name) => {
      /* Nag timers belong to the beat that raised them, not to the mission —
       * arriving somewhere new must not immediately inherit twenty seconds of
       * somebody else's impatience. */
      this.stall = 0;
      this.stallIndex = 0;
      this.onBeat(name, BEAT_OF[name] ?? 0);
    });
  }

  /* ================================================================== */
  /* Public surface                                                      */
  /* ================================================================== */

  /** Begin. Claims the mission in the campaign if there is one. */
  start() {
    if (this.fsm.name) return false;
    this.story?.begin?.();
    this.fsm.start(S.ARRIVAL);
    return true;
  }

  /**
   * One frame. `position` is anything with `.x`/`.z` — the player — and is
   * what fires the proximity barks and the walk-there beats. Everything that
   * MATTERS is a player action, never a position, so a mission handed no
   * position at all still plays; it just has to be walked by hand.
   */
  update(dt, { position = null } = {}) {
    if (!this.fsm.name || this.complete) {
      this.dialogue.update(dt);
      return;
    }
    if (position) this.#checkZones(position);
    this.dialogue.update(dt);
    this.fsm.update(dt);
  }

  /** Enter a named zone by hand (the mount calls this from a trigger volume,
   * and a verifier calls it directly). */
  arrive(zoneId) {
    if (this.zonesEntered.has(zoneId)) return false;
    this.zonesEntered.add(zoneId);
    this.#onZone(zoneId);
    return true;
  }

  /* ---------------- the player's own hands ---------------- */

  /** Beat 2. He carries it in and puts it down; nobody takes it off him. */
  placeCaseOnDesk() {
    if (!this.#at(S.LOU_OFFICE) || this.caseState !== 'carried') return false;
    this.caseState = 'desk';
    this.caseOnDesk = true;
    this.onCase('desk');
    this.#instruct('');
    this.story?.checkpoint?.('office');
    this.fsm.go(S.LOU_OPENS_CASE);
    return true;
  }

  /** Beat 2. Lou slid it back across the desk. It does not follow him. */
  takeCaseBack() {
    if (!this.#at(S.TAKE_CASE_BACK) || this.caseState !== 'desk') return false;
    this.caseState = 'carried';
    this.caseOnDesk = false;
    this.onCase('carry');
    this.#instruct('');
    this.dialogue.interject(SEQUENCES.officeLeaving);
    this.fsm.go(S.HIDDEN_ENTRANCE);
    return true;
  }

  /** Beat 3. The switch under the marble Sasquatch. */
  pressBustSwitch() {
    if (!this.#at(S.HIDDEN_ENTRANCE) || this.wallOpened) return false;
    this.wallOpened = true;
    this.#instruct('');
    this.dialogue.play(SEQUENCES.cellarWallOpens, {
      onDone: () => this.fsm.go(S.STAIRWELL),
    });
    this.story?.checkpoint?.('basement');
    return true;
  }

  /**
   * Beat 6. The case goes on the transfer table.
   *
   * Accepted from the corridor onwards, not only once the mission has noticed
   * he arrived: a player who walks straight past Irish, past xXx and up to the
   * table has done the beat, and refusing him because a trigger volume never
   * fired would be the mission arguing with the man playing it.
   */
  deliverCase() {
    if (!this.#at(S.STAIRWELL, S.INTERROGATION, S.OBSERVATION, S.DELIVERY)) return false;
    if (this.caseState !== 'carried') return false;
    this.caseState = 'table';
    this.caseDelivered = true;
    this.onCase('table');
    this.#instruct('');
    this.dialogue.play(SEQUENCES.deliveryOpen, {
      onDone: () => this.fsm.go(S.BUILD),
    });
    this.story?.checkpoint?.('lab');
    this.fsm.go(S.DELIVERY);
    return true;
  }

  /**
   * Beat 8. The keypad. Returns true only for the code that works.
   *
   * A wrong code is refused by the KEYPAD, not by the mission: `lab.keypad
   * .enter()` is the authority, so the door cannot be locked by a mission that
   * merely believes the right buttons were pressed.
   */
  enterCode(code) {
    if (!this.#at(S.LOCK_THE_LAB)) return false;
    const typed = String(code ?? '');
    this.keypadAttempts.push(typed);
    const ok = this.lab.keypad?.enter?.(typed) === true;
    if (!ok) {
      this.wrongCodes++;
      this.dialogue.interject(
        this.wrongCodes > 1 ? SEQUENCES.keypadWrongTwice : SEQUENCES.keypadWrong,
      );
      return false;
    }
    this.#instruct('');
    this.dialogue.play(SEQUENCES.doorLocked, {
      onDone: () => {
        /* The order the spec sets: the objective goes up when Booski has
         * finished saying "Handle it", and Aubbie's pleading runs UNDER it,
         * with the button prompt arriving only once he has run out of things
         * to say. */
        this.#objective(OBJECTIVES.ELIMINATE_AUBBIE);
        this.dialogue.play(SEQUENCES.aubbiePleads, {
          onDone: () => {
            this.#instruct(INSTRUCTIONS.ELIMINATE_AUBBIE);
            this.hud.setCallout(TARGET_CALLOUTS.ELIMINATE_AUBBIE);
          },
        });
        this.fsm.go(S.EXECUTION);
      },
    });
    this.story?.checkpoint?.('locked');
    return true;
  }

  /**
   * Beat 8. The player's shot.
   *
   * `hit` is resolved by the scene against what the crosshair was actually on
   * — the mission does not decide that a trigger pull found him. And he can
   * only be killed where the spec says he dies: in the OBSERVATION AREA, on
   * this side of the glass, in full view of the five people behind it. If he
   * is somehow still inside, this refuses.
   */
  shootAubbie(hit = null) {
    if (!this.#at(S.EXECUTION) || this.aubbieKilled) return false;
    if (!hit?.point?.isVector3 || !hit.object?.isObject3D) {
      this.aubbieMissedShots++;
      this.dialogue.interject(SEQUENCES.executionMiss);
      return false;
    }
    if (!this.aubbieOutside) return false;
    this.aubbieKilled = true;
    this.aubbieKilledSide = 'observation';
    this.#instruct('');
    this.hud.setCallout('');
    const aubbie = this.lab.scientists?.[SCIENTIST_INDEX.AUBBIE];
    /* THE BLOOD, THEN THE FALL, in that order (owner playtest: "blood effect
     * when Aubbie is shot"). `shot` is the round arriving and `collapse` is
     * the body going down, and they are two calls because the gassing uses
     * the second one five times over and none of that is bloody. `from` is
     * where the shot came from so the wound faces the shooter; the mission
     * does not know where the player is standing, so the scene resolves it
     * against his own body when it is not told. */
    aubbie?.shot?.(hit);
    this.bloodShed = true;
    aubbie?.collapse?.();
    this.dialogue.play(SEQUENCES.executionDone, {
      onDone: () => this.fsm.go(S.REACTION),
    });
    this.story?.checkpoint?.('aubbie_down');
    return true;
  }

  /** Beat 10. Booski lifted the cover. He does not pull it. */
  pullSilentNight() {
    if (!this.#at(S.SILENT_NIGHT)) return false;
    /* The LEVER, not only the sequence. The mount's registration replaces
     * the scene's own on the same mesh (`userData.interact` is a single
     * slot), so without this the physical lever never travelled and the
     * cover state never latched -- the gas arrived out of a pedestal that
     * had visibly not been pulled. `pull()` also starts the gas; the
     * `alarm.start` stage at the head of `silentNightPulled` fires on the
     * same frame and its second `gas.start()` is a guarded no-op, so the
     * timing is exactly what it was. */
    this.lab.silentNight?.pull?.();
    this.#instruct('');
    this.dialogue.play(SEQUENCES.silentNightPulled, {
      onDone: () => this.fsm.go(S.GASSING),
    });
    this.story?.checkpoint?.('silent_night');
    return true;
  }

  /** Beat 11. Up the stairwell; the wall closes and the lab is not audible. */
  leave() {
    if (!this.#at(S.EXIT) || this.leaving) return false;
    this.leaving = true;
    this.#instruct('');
    this.dialogue.play(SEQUENCES.wallCloses, {
      /* NOT `COMPLETE`. Getting out of the basement is the first half of what
       * Booski asked for; the second half is the man he told you to go and
       * see. See `S.BACK_TO_LOU`. */
      onDone: () => this.fsm.go(S.BACK_TO_LOU),
    });
    return true;
  }

  /**
   * Beat 11. He is back in the office, and that is the night.
   *
   * The player's own action, like everything else in this mission — the
   * `officeReturn` trigger volume calls it when he walks in, and a verifier
   * calls it directly. Refuses at every other moment.
   */
  reportToLou() {
    if (!this.#at(S.BACK_TO_LOU) || this.reportingToLou) return false;
    this.reportingToLou = true;
    this.#instruct('');
    this.dialogue.play(SEQUENCES.louAfterLab, {
      onDone: () => {
        this.reportedToLou = true;
        this.fsm.go(S.COMPLETE);
      },
    });
    return true;
  }

  /** Everything a verifier or a test needs to prove this happened. */
  report() {
    return {
      state: this.fsm.name,
      beat: this.fsm.beat,
      history: [...this.fsm.history],
      objective: this.objective,
      instruction: this.instruction,
      objectives: [...this.objectiveLog],
      instructions: [...this.instructionLog],
      case: {
        state: this.caseState,
        placedOnDesk: this.caseOnDesk || this.caseState !== 'carried',
        delivered: this.caseDelivered,
        throughDrawer: this.caseThroughDrawer,
      },
      keypad: {
        attempts: [...this.keypadAttempts],
        rejected: this.wrongCodes,
        locked: this.lab.doorLocked === true,
      },
      /** Did Booski arm him, and when. The execution is four beats later. */
      sidearmGiven: this.sidearmGiven,
      aubbie: {
        outside: this.aubbieOutside,
        killed: this.aubbieKilled,
        side: this.aubbieKilledSide,
        missedShots: this.aubbieMissedShots,
        /** The round landed and the scene was told to bleed him. */
        bled: this.bloodShed,
      },
      muffled: this.lab.muffled === true,
      glassRouted: this.glassRouted,
      dryRouted: this.dryRouted,
      gasStages: [...this.gasStages],
      /** How many of DeathMegatron's gassing taunts actually landed. */
      dmtTaunts: this.tauntCursor,
      collapsed: [...this.collapsed],
      handprints: this.handprints,
      bezmenovTriedHandleFirst: this.bezmenovTriedHandleFirst,
      chairBent: this.chairBent,
      lifeSigns: this.lab.lifeSigns ?? null,
      lifeSignsAtAftermath: this.lifeSignsAtAftermath,
      lifeSignsTimedOut: this.lifeSignsTimedOut,
      cues: [...this.dialogue.cueLog],
      stages: [...this.dialogue.stageLog],
      reportingToLou: this.reportingToLou,
      reportedToLou: this.reportedToLou,
      complete: this.complete,
    };
  }

  /* ================================================================== */
  /* Internals                                                           */
  /* ================================================================== */

  /**
   * Is the mission at (or already on its way to) one of these beats?
   *
   * A transition requested during a frame is only APPLIED at the tail of that
   * frame — see SilentSquatchStateMachine. A player's keypress can land in the
   * gap, and "you pressed E one sixtieth of a second early" is not a thing the
   * mission is allowed to say to him, so a pending beat counts as the current
   * one. It also counts AGAINST the beat being left: once the mission has
   * decided to move on, the action it was waiting for is over.
   */
  #at(...names) {
    return names.includes(this.fsm.pending ?? this.fsm.name);
  }

  #objective(text) {
    this.objective = text;
    this.objectiveLog.push(text);
    this.hud.setObjective(text);
  }

  #instruct(text) {
    this.instruction = text;
    if (text) this.instructionLog.push(text);
    this.hud.setInstruction(text);
  }

  /**
   * A beat, and only then the button.
   *
   * The owner's rule for every scene, and the reason this helper exists rather
   * than two calls at the call site: showing the instruction on the same frame
   * as the line reads as the game talking over its own cast. `sayThenInstruct`
   * in src/silvercase/main.js is the same shape.
   */
  #sayThenInstruct(sequence, instruction, { objective = null, onDone = null } = {}) {
    this.dialogue.play(sequence, {
      onDone: () => {
        if (objective) this.#objective(objective);
        if (instruction) this.#instruct(instruction);
        onDone?.();
      },
    });
  }

  /** Route a line to the right mouth. Behind the glass, that is a scientist's
   * body and `lab.glassAudio`; in the observation room it is a plain cue. */
  #speak(cue, voice, line, playCue) {
    if (!cue) return 0;
    /* xXx is a real body in the corridor, not a room-wide fallback cue. This
     * route gives his mouth and spatial source the take while he is alive and
     * makes death authoritative at the final audio boundary: even a line that
     * was queued a frame before the fatal hit cannot come out of a corpse. */
    if (line.speaker === 'XXX') {
      if (this.lab.xxx?.alive === false) return 0;
      if (this.lab.xxx?.say) {
        const gain = gainForVoice(voice, { sealed: false });
        return this.lab.xxx.say(cue, {
          volume: LAB_BODY_VOLUME * gain,
          dry: true,
        }) || 0;
      }
    }
    const index = SCIENTIST_INDEX[line.speaker];
    /* Owner playtest: "Aubbie volume +20%". Per PROFILE, so it reaches him on
     * both of his routes and on the lines nobody has recorded yet. See
     * `VOICE_GAIN` in ../script.js. `LAB_BODY_VOLUME` is the level the
     * laboratory plays a body's line at when nobody says otherwise; it is
     * restated here because this is the caller that now says otherwise. */
    const gain = gainForVoice(voice, { sealed: line.muffled });
    const volume = LAB_BODY_VOLUME * gain;
    if (line.muffled) {
      this.glassRouted++;
      const body = index === undefined ? null : this.lab.scientists?.[index];
      /* Both muffled routes return the take's length for the same reason the
       * dry one does — a line behind the glass is still a line, and the
       * controller has to know how long to hold it or the next one talks over
       * it. See `DialogueController._advance`. */
      if (body?.say) return body.say(cue, { volume }) || 0;
      /* No body for this speaker, so it goes through the glass bus directly.
       * That path returns an audio node rather than a length, and there is no
       * duration accessor on it — so this reports 0 and the line falls back to
       * its authored hold. Worth knowing rather than guessing: it is the only
       * route in the scene that still does. */
      this.lab.glassAudio?.play?.(cue);
      return 0;
    }
    this.dryRouted++;
    /**
     * A SCIENTIST WHO HAS WALKED OUT FROM BEHIND THE GLASS IS STILL A BODY.
     *
     * Owner playtest, 2026-08-06: *"Aubbie's mouth stops moving once he leaves
     * the lab."* It did, and the reason was this branch. A scientist's mouth
     * is moved by `lab.scientists[i].say()` — the laboratory plays the cue AND
     * hands the playing node to his jaw (src/core/mouth.js). That call only
     * ever happened on the MUFFLED route, because muffled was being used as a
     * proxy for "this line comes out of a body". It is not: it means "there is
     * twelve centimetres of glass in the way".
     *
     * So from `door.open` onwards — the eleven lines of Aubbie's the whole
     * execution is made of, "It is complete", "Booski, we had agreement", "You
     * do not have to do this" — every one of them was played by `playCue`,
     * which is a bare `audio.play()` that has never heard of him, and he
     * pleaded for his life with his mouth shut.
     *
     * The body is asked FIRST and the plain cue is the fallback, which is also
     * the right way round for everybody else: Booski, Lou and the guards have
     * no entry in `SCIENTIST_INDEX`, so they take the fallback unchanged and
     * their mouths keep being moved by the cast's own subtitle-bar wrapper.
     *
     * `dry: true` is not a guess — the mission knows this line is not behind
     * the glass, and saying so beats letting the body infer it from a `side`
     * flag that the mission is the thing that sets.
     */
    const body = index === undefined ? null : this.lab.scientists?.[index];
    if (body?.say) return body.say(cue, { volume, dry: true }) || 0;
    return playCue?.(cue, voice, gain, line) || 0;
  }

  /** Stage directions written into the script. The lab ones are performed
   * here; everything cosmetic is handed to the scene. */
  #stage(stage, line) {
    switch (stage) {
      case 'wall.open':
        this.lab.hiddenWall?.open?.();
        break;
      case 'wall.close':
        this.lab.hiddenWall?.close?.();
        break;
      case 'drawer.send':
        this.lab.transferDrawer?.send?.();
        this.caseThroughDrawer = true;
        this.caseState = 'gone';
        this.onCase('gone');
        break;
      case 'core.begin':
        this.lab.core?.begin?.();
        break;
      case 'core.complete':
        this.lab.core?.complete?.();
        this.lab.monitors?.setPurple?.();
        break;
      case 'door.open':
        /* Aubbie comes out through the glass door, and from here on he is on
         * the player's side of it. This flag is what makes the execution
         * legal — see shootAubbie(). */
        this.lab.openDoor?.();
        this.lab.scientists?.[SCIENTIST_INDEX.AUBBIE]?.stepOut?.();
        this.aubbieOutside = true;
        break;
      case 'door.lock':
        this.lab.closeDoor?.();
        this.lab.lockDoor?.();
        break;
      case 'alarm.start':
        this.lab.gas?.start?.();
        break;
      /* Beat 10's set-up: "Booski lifts the cover and does not pull it." The
       * direction has been in `silentNightOrder` since it was written and
       * nothing performed it -- the scene's red safety cover stayed shut over
       * the lever for the whole of beats 10 and 11 while Booski said he had
       * lifted it. (It also opens the scene's own `silentNight` gate, for a
       * house running without the mount's registrations.) */
      case 'cover.lift':
        this.lab.silentNight?.liftCover?.();
        break;
      case 'glass.chair':
        /* The swing as well as the flag. Sokolov's "Move! Move back!" is the
         * line before this direction, so he is the one with the chair --
         * `chairStrike()` is the impact on the glass audio path plus the
         * chair deforming, and until this call the real lab never heard it:
         * the verifier drove `chairStrike` directly, the mission only set a
         * bookkeeping flag, and beat 9's one big physical beat played as a
         * subtitle over silence. */
        this.lab.scientists?.[SCIENTIST_INDEX.SOKOLOV]?.chairStrike?.();
        this.chairBent = true;
        break;
      case 'xxx.cough':
        if (this.lab.xxx?.alive !== false) this.lab.xxx?.cough?.();
        break;
      case 'case.open':
        this.onCase('open');
        break;
      case 'case.close':
        this.onCase('close');
        break;
      case 'case.slide':
        this.onCase('slide');
        break;
      /* Booski arms him at the delivery. The mission does not know what a
       * weapon is — it says a man handed one over and the composition root
       * decides what that means, exactly like `onCase`. See the note in
       * script.js at `deliveryOpen`. */
      case 'sidearm.give':
        this.sidearmGiven = true;
        this.onSidearm(true);
        break;
      default:
        break;
    }
    this.onStageHook?.(stage, line);
  }

  #checkZones(position) {
    const px = position.x;
    const py = position.y;
    const pz = position.z;
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    for (const [id, zone] of Object.entries(this.zones)) {
      if (!zone || this.zonesEntered.has(id)) continue;
      /* Every authored Mansion anchor has a world-space Y. The west wing is
       * directly above the lab corridor, so an X/Z-only check consumed the
       * lower doorway while the player was still upstairs and even let xXx
       * bark through the floor. A zone that supplies Y is therefore a real
       * short trigger cylinder; old unit/contract callers that omit Y retain
       * their original planar behavior. */
      if (Number.isFinite(zone.y)) {
        if (!Number.isFinite(py)) continue;
        const verticalTolerance = Number.isFinite(zone.verticalTolerance)
          ? Math.max(0, zone.verticalTolerance)
          : 1.25;
        if (Math.abs(py - zone.y) > verticalTolerance) continue;
      }
      const r = zone.r ?? 2.5;
      if ((px - zone.x) ** 2 + (pz - zone.z) ** 2 > r * r) continue;
      /* A room anchor says the player reached the room. It does not prove the
       * PERSON whose line this is can hear him: Rippin stands 2.93 m off his
       * lounge anchor, and the old 3.2 m cylinder therefore fired more than
       * six metres from his body. A refused organic entry is not consumed, so
       * walking up to the real speaker can still get the line. */
      if (this.canEnterZone?.(id, position, zone) === false) continue;
      this.arrive(id);
    }
  }

  /** A one-shot bark, which never disturbs a running beat. */
  #bark(key, sequence) {
    if (this.barked.has(key)) return;
    this.barked.add(key);
    this.dialogue.interject(sequence);
    this.onNpcBark?.(key, 'arrival');
  }

  #onZone(zoneId) {
    switch (zoneId) {
      /* Beat 1 — the house, populated. */
      case 'rippin': this.#bark('rippin', SEQUENCES.rippinBar); break;
      case 'eric': this.#bark('eric', SEQUENCES.ericTable); break;
      case 'shubes': this.#bark('shubes', SEQUENCES.shubesHallway); break;
      case 'snow': this.#bark('snow', SEQUENCES.snowFoyer); break;
      case 'office':
        if (this.fsm.is(S.ARRIVAL)) this.fsm.go(S.LOU_OFFICE);
        break;
      /* THE SAME ROOM, A SECOND TIME, AND THEREFORE A SECOND ZONE ID.
       * `arrive()` fires each id once and only once — walking back into the
       * office on `office` would be swallowed by the visit he made in beat 2,
       * and the night would never end.
       *
       * ...AND A SECOND ID IS NOT ENOUGH ON ITS OWN. The player stands in this
       * room in beat 2 as well, with the case in his hands, and `arrive()`
       * CONSUMES an id the first time the trigger volume is crossed whatever
       * the handler does with it. So beat 2's visit ate beat 11's zone and the
       * mission could never be finished — the objective said "Report to Lou in
       * his office", the player walked into Lou's office, and nothing
       * happened. A visit that is not beat 11's puts the id straight back. */
      case 'officeReturn':
        /* Arrival only puts Lou within reach. The mission completes when the
         * player presses E on Lou's body, not on this invisible volume. */
        if (!this.fsm.is(S.BACK_TO_LOU)) this.zonesEntered.delete('officeReturn');
        /* AND THIS IS WHERE "PRESS E ON LOU" BECOMES TRUE. It used to be
         * raised the moment the wall shut behind him at the top of the cellar
         * stairs, which is two floors and a boardroom away from Lou -- the
         * exact contradiction the three legs of this walk were written to
         * end. INSTRUCTIONS.RETURN_TO_OFFICE was authored for the middle leg
         * and never raised anywhere; it is raised in S.BACK_TO_LOU now, and
         * hands over here, when the player is actually in the room. */
        else this.#instruct(INSTRUCTIONS.TALK_TO_LOU);
        break;
      case 'cellar':
        this.#bark('cellar', SEQUENCES.cellarArrival);
        break;
      case 'bust':
        if (this.fsm.is(S.HIDDEN_ENTRANCE)) {
          this.#sayThenInstruct(SEQUENCES.cellarBust, INSTRUCTIONS.BUST_SWITCH);
        }
        break;
      case 'corridor':
        if (this.fsm.is(S.STAIRWELL)) this.fsm.go(S.INTERROGATION);
        break;
      case 'xxx':
        if (this.lab.xxx?.alive === false) break;
        if (this.fsm.is(S.EXIT)) this.#bark('xxxOut', SEQUENCES.xxxOnTheWayOut);
        else this.#bark('xxx', SEQUENCES.xxxHanging);
        break;
      case 'observation':
        if (this.fsm.is(S.INTERROGATION, S.STAIRWELL)) this.fsm.go(S.OBSERVATION);
        break;
      case 'stairs':
        if (this.fsm.is(S.EXIT)) this.#bark('snowStairs', SEQUENCES.snowOnTheStairs);
        break;
      case 'cellarTop':
        if (this.fsm.is(S.EXIT)) this.leave();
        break;
      default:
        break;
    }
  }

  /** Nag lines, cycled so the same one never repeats twice running. */
  #stalls(dt, seconds, sequences) {
    if (this.dialogue.busy) { this.stall = 0; return; }
    this.stall += dt;
    if (this.stall < seconds) return;
    this.stall = 0;
    const seq = sequences[this.stallIndex % sequences.length];
    this.stallIndex++;
    this.dialogue.interject(seq);
  }

  #aliveInside() {
    const list = [];
    for (const index of COLLAPSE_ORDER) {
      if (!this.collapsed.includes(index)) list.push(index);
    }
    return list;
  }

  #states() {
    const go = (name) => this.fsm.go(name);

    return {
      /* ============================================================== */
      /* BEAT 1 — arrival                                                */
      /* ============================================================== */
      [S.ARRIVAL]: {
        enter: () => {
          this.onCase('carry');
          this.#objective(OBJECTIVES.DELIVER_PACKAGE);
          this.dialogue.play(SEQUENCES.arrivalProspect);
        },
        update: (dt) => {
          /* Nobody nags him here. The house is full of people with something
           * to say and he is allowed to stand in it. */
          this.#idleBarks(dt);
        },
      },

      /* ============================================================== */
      /* BEAT 2 — Lou's office                                           */
      /* ============================================================== */
      [S.LOU_OFFICE]: {
        enter: () => {
          this.#sayThenInstruct(SEQUENCES.officeEnter, INSTRUCTIONS.PLACE_CASE);
        },
        update: (dt) => this.#stalls(dt, 20, [SEQUENCES.officeStall]),
      },

      [S.LOU_OPENS_CASE]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.officeOpen, {
            onDone: () => {
              this.#objective(OBJECTIVES.TAKE_TO_BOOSKI);
              this.#instruct(INSTRUCTIONS.TAKE_CASE);
              go(S.TAKE_CASE_BACK);
            },
          });
        },
      },

      [S.TAKE_CASE_BACK]: {
        update: (dt) => this.#stalls(dt, 22, [SEQUENCES.officeLeaving]),
      },

      /* ============================================================== */
      /* BEAT 3 — the hidden entrance                                    */
      /* ============================================================== */
      [S.HIDDEN_ENTRANCE]: {
        enter: () => {
          /* If the scene gave us no bust zone, the Prospect works it out on
           * his own rather than the mission waiting forever for a trigger. */
          if (this.zones.bust || this.wallOpened) return;
          this.dialogue.play(SEQUENCES.cellarArrival, {
            onDone: () => this.#sayThenInstruct(SEQUENCES.cellarBust, INSTRUCTIONS.BUST_SWITCH),
          });
        },
      },

      [S.STAIRWELL]: {
        enter: () => {
          this.dialogue.interject(SEQUENCES.stairwell);
          if (!this.zones.corridor && !this.zones.observation) go(S.INTERROGATION);
        },
      },

      /* ============================================================== */
      /* BEAT 4 — the interrogation area and xXx                         */
      /* ============================================================== */
      [S.INTERROGATION]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.irishCorridor, {
            onDone: () => {
              /* With no xXx trigger volume, he still gets his lines: he is
               * hanging in the middle of the only corridor there is. */
              if (!this.zones.xxx && this.lab.xxx?.alive !== false) {
                this.#bark('xxx', SEQUENCES.xxxHanging);
              }
            },
          });
        },
        update: (dt) => {
          /* The corridor is one straight run and the observation area is the
           * far end of it. A scene that gave us a trigger volume down there
           * uses it; a scene that did not moves him on once he has heard
           * Irish and xXx rather than stranding him in a corridor with a man
           * hanging in it. Booski belongs to the far threshold and is queued
           * only by OBSERVATION below. */
          if (!this.zones.observation && !this.dialogue.busy && this.fsm.time > 4) {
            go(S.OBSERVATION);
            return;
          }
          this.#stalls(dt, 26, [SEQUENCES.irishIdle]);
        },
      },

      /* ============================================================== */
      /* BEAT 5/6 — the observation area, and the delivery               */
      /* ============================================================== */
      [S.OBSERVATION]: {
        enter: () => {
          /* The player has now crossed the threshold beyond xXx. Keep
           * Booski's call, the room reaction and the case greeting in one
           * ordered queue so none of them overlap or leak up the stair. */
          this.dialogue.play([...SEQUENCES.booskiShouts, ...SEQUENCES.observationArrival], {
            onDone: () => {
              this.#sayThenInstruct(SEQUENCES.deliveryGreeting, INSTRUCTIONS.DELIVER_CASE);
            },
          });
        },
        update: (dt) => this.#stalls(dt, 24, [SEQUENCES.deliveryStall, SEQUENCES.observationIdle]),
      },

      [S.DELIVERY]: {
        /* deliverCase() queues the whole beat and hands us BUILD when it
         * drains; there is nothing to do per frame. */
      },

      [S.BUILD]: {
        enter: () => {
          this.asideTimer = 12;
          this.dialogue.play(SEQUENCES.build, { onDone: () => go(S.COMPLETION) });
        },
        update: (dt) => {
          /* Booski and DeathMegatron talk over the work, at intervals, the
           * way two men watching other men work actually do. */
          if (this.asideIndex >= SEQUENCES.buildAsides.length) return;
          this.asideTimer -= dt;
          if (this.asideTimer > 0) return;
          this.asideTimer = 14;
          this.dialogue.interject([SEQUENCES.buildAsides[this.asideIndex]]);
          this.asideIndex++;
        },
      },

      /* ============================================================== */
      /* BEAT 7 — completion                                             */
      /* ============================================================== */
      [S.COMPLETION]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.completion, {
            onDone: () => {
              this.story?.checkpoint?.('core_complete');
              go(S.AUBBIE_OUT);
            },
          });
        },
      },

      [S.AUBBIE_OUT]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.aubbieOut, { onDone: () => go(S.LOCK_ORDER) });
        },
      },

      /* ============================================================== */
      /* BEAT 8 — locking, and the execution                             */
      /* ============================================================== */
      [S.LOCK_ORDER]: {
        enter: () => {
          this.#sayThenInstruct(SEQUENCES.lockOrder, null, {
            objective: OBJECTIVES.LOCK_THE_LAB,
            onDone: () => go(S.LOCK_THE_LAB),
          });
        },
      },

      [S.LOCK_THE_LAB]: {
        enter: () => {
          if (this.lab.doorLocked) return;
          this.lab.keypad?.arm?.();
          /* A character says the number out loud, and the screen says which
           * buttons afterwards. Nobody in this room thinks the number is
           * funny, and nothing in the scene acknowledges it. */
          this.#sayThenInstruct(SEQUENCES.keypadCode, INSTRUCTIONS.KEYPAD);
        },
        update: (dt) => this.#stalls(dt, 30, [SEQUENCES.keypadCode]),
      },

      [S.EXECUTION]: {
        update: (dt) => this.#stalls(dt, 16, [
          SEQUENCES.executionStallAubbie,
          SEQUENCES.executionStallBooski,
          SEQUENCES.executionStallDmt,
        ]),
      },

      /* ============================================================== */
      /* BEAT 9 — the reaction                                           */
      /* ============================================================== */
      [S.REACTION]: {
        enter: () => {
          /* The old one notices the door first — the spec's note — and he is
           * the one who stops and stares while the others are still hitting
           * it, because he has been expecting this since March. */
          const bezmenov = this.lab.scientists?.[SCIENTIST_INDEX.BEZMENOV];
          if (bezmenov) {
            bezmenov.tryHandle?.();
            this.bezmenovTriedHandleFirst = true;
          }
          for (const index of this.#aliveInside()) {
            if (index === SCIENTIST_INDEX.BEZMENOV) continue;
            this.lab.scientists?.[index]?.panic?.();
          }
          bezmenov?.stare?.();
          this.dialogue.play(SEQUENCES.reaction, {
            onDone: () => {
              this.dialogue.play(SEQUENCES.reactionChair, {
                onDone: () => go(S.SILENT_NIGHT_ORDER),
              });
            },
          });
        },
      },

      /* ============================================================== */
      /* BEAT 10 — Silent Night                                          */
      /* ============================================================== */
      [S.SILENT_NIGHT_ORDER]: {
        enter: () => {
          this.#sayThenInstruct(SEQUENCES.silentNightOrder, INSTRUCTIONS.SILENT_NIGHT, {
            objective: OBJECTIVES.ACTIVATE_SILENT_NIGHT,
            onDone: () => go(S.SILENT_NIGHT),
          });
        },
      },

      [S.SILENT_NIGHT]: {
        update: (dt) => this.#stalls(dt, 18, [SEQUENCES.silentNightStall]),
      },

      [S.GASSING]: {
        update: (dt) => this.#gassing(dt),
      },

      [S.AFTERMATH]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.aftermath, { onDone: () => go(S.SNOW_CALL) });
        },
      },

      /* ============================================================== */
      /* BEAT 11 — Snow, and the exit                                    */
      /* ============================================================== */
      [S.SNOW_CALL]: {
        enter: () => {
          this.dialogue.play(SEQUENCES.snowIntercom, {
            onDone: () => {
              this.story?.checkpoint?.('clear');
              go(S.EXIT);
            },
          });
        },
      },

      [S.EXIT]: {
        enter: () => {
          if (this.leaving) return;
          /* The inbound corridor crossing already spent this one-shot zone.
           * Rearm it for the authored return bark only while its speaker is
           * still alive; a corpse never owns an interaction volume. */
          if (this.zones.xxx && this.lab.xxx?.alive !== false) {
            this.zonesEntered.delete('xxx');
          }
          /* Booski says "Upstairs. Lou's still awake."; the objective names
           * Lou; the instruction says which stair. All three agree, which is
           * the whole of the owner's flow note. */
          this.#sayThenInstruct(SEQUENCES.exitOrder, INSTRUCTIONS.RETURN_UPSTAIRS, {
            objective: OBJECTIVES.REPORT_TO_LOU,
          });
        },
        update: (dt) => this.#stalls(dt, 40, [SEQUENCES.exitOrder]),
      },

      /**
       * Beat 11, second leg: the cellar door is behind him and Lou is
       * upstairs.
       *
       * The mission used to finish HERE, at the top of the stairwell, with an
       * objective that had said "Return upstairs." since the basement — so the
       * night ended in a wine cellar, three floors below the man who sent him,
       * with nothing on screen to say it was over.
       *
       * A scene with no office trigger volume — `mission/contract-lab.js`, and
       * any harness driving the mission on its own — completes here instead of
       * standing about waiting for a zone that does not exist. Same idiom as
       * `S.STAIRWELL` and `S.INTERROGATION` above.
       */
      [S.BACK_TO_LOU]: {
        enter: () => {
          this.#objective(OBJECTIVES.LOU_IS_WAITING);
          /* THE MIDDLE LEG, which nothing had ever raised. The walk out is
           * three legs -- the stairwell, the main stairs, and the man -- and
           * the instruction for the second one sat in script.js with exactly
           * one reference in the whole tree: its own definition. What was
           * raised here instead was TALK_TO_LOU, at the top of the cellar
           * stairs, telling a player two floors below to press E on a man he
           * cannot see. It hands over in `arrive('officeReturn')`. */
          this.#instruct(INSTRUCTIONS.RETURN_TO_OFFICE);
          if (!this.zones.officeReturn) {
            /* No office volume -- contract-lab, and any harness driving the
             * mission on its own. There is no room to walk into, so the leg
             * that ends in one does not exist and the night finishes here. */
            go(S.COMPLETE);
            return;
          }
        },
        /* Booski gave the order once in EXIT. The objective remains while the
         * player roams; the same cue no longer repeats every 45 seconds. */
      },

      [S.COMPLETE]: {
        enter: () => {
          this.complete = true;
          this.#objective('');
          this.#instruct('');
          this.story?.complete?.(this.report());
        },
      },
    };
  }

  /** Beat 1's second pass — the men who have not said their line yet say it
   * if he stands around, so the house is never silent at him. */
  #idleBarks(dt) {
    if (this.dialogue.busy) { this.stall = 0; return; }
    this.stall += dt;
    if (this.stall < 18) return;
    const candidates = [
      ['rippin', SEQUENCES.rippinIdle],
      ['eric', SEQUENCES.ericIdle],
      ['shubes', SEQUENCES.shubesIdle],
      ['snow', SEQUENCES.snowIdle],
    ];
    /* The old loop chose a voice globally every eighteen seconds. A player in
     * the drive therefore heard Rippin in the lounge, then Eric upstairs, at
     * full level. Keep the authored rotation, but put a line down only for a
     * real speaker the shared Mansion gate says is audible now. Leave the
     * timer charged when nobody is: approaching somebody should make the
     * house responsive, not impose a fresh eighteen-second wait. */
    for (let offset = 0; offset < candidates.length; offset++) {
      const index = (this.stallIndex + offset) % candidates.length;
      const [speakerId, sequence] = candidates[index];
      if (this.canIdleBark?.(speakerId) === false) continue;
      this.stall = 0;
      this.stallIndex += offset + 1;
      this.dialogue.interject(sequence);
      this.onNpcBark?.(speakerId, 'idle');
      return;
    }
  }

  /**
   * The gassing, paced off `lab.gas.density` in the spec's seven stages, then
   * one collapse at a time, then the monitor.
   */
  #gassing(dt) {
    const density = Number.isFinite(this.lab.gas?.density) ? this.lab.gas.density : 0;

    for (const stage of GAS_STAGES) {
      if (this.gasStages.includes(stage.id) || density < stage.at) continue;
      this.gasStages.push(stage.id);
      if (stage.act) {
        for (const index of this.#aliveInside()) {
          const body = this.lab.scientists?.[index];
          /* `cover` and `slam` are not in the published contract; a lab that
           * grows them gets used, a lab that has not still plays the stage. */
          body?.[stage.act]?.();
        }
      }
      const lines = SEQUENCES[stage.lines];
      if (lines) this.dialogue.interject(lines);
    }

    /* DeathMegatron's running commentary, one line at a time, never OVER
     * anybody — `interject` is a queue, so her line always waits for the
     * active mouth to finish. A free floor she takes at once; a floor the
     * dying keep full (they do — the seven stages' lines run the gas nearly
     * wall to wall) she cuts into after a few seconds' relish, landing
     * between their lines rather than on top of them. Still strictly in
     * order, and anything unfired when the aftermath takes the floor is
     * simply never said, which is also how a person behaves. */
    if (this.tauntCursor < DMT_GAS_TAUNTS.length
      && density >= DMT_GAS_TAUNTS[this.tauntCursor].at) {
      this.tauntWait += dt;
      /* Three seconds of relish before she cuts in: an interjection lands
       * in front of whatever is queued, so a waited taunt slots in after
       * the line being spoken and ahead of the next cry — between their
       * lines, never over them. The seven stages keep this floor close to
       * full, so without the cut-in she never speaks at all; with it she
       * takes the NEXT slot now and then, which is exactly the cruelty the
       * owner asked to hear. Nothing is lost to the jump: the aftermath
       * below waits for the whole floor to drain, so a displaced cry still
       * plays — after her, which is the point of her. */
      if (!this.dialogue.busy || this.tauntWait >= 3) {
        this.dialogue.interject([DMT_GAS_TAUNTS[this.tauntCursor].line]);
        this.tauntCursor++;
        this.tauntWait = 0;
        this.onNpcBark?.('deathmegatron', 'gassing');
      }
    } else {
      this.tauntWait = 0;
    }

    if (!this.gasStages.includes('collapsing')) return;

    /* One by one, not all at once. The last one to the glass leaves the
     * smeared handprint the spec asks for, and then goes down too. */
    if (this.collapseCursor < COLLAPSE_ORDER.length) {
      this.collapseTimer -= dt;
      if (this.collapseTimer <= 0) {
        this.collapseTimer = COLLAPSE_INTERVAL;
        const index = COLLAPSE_ORDER[this.collapseCursor];
        this.collapseCursor++;
        const body = this.lab.scientists?.[index];
        if (this.collapseCursor === COLLAPSE_ORDER.length) {
          body?.handprint?.();
          this.handprints++;
        }
        body?.collapse?.();
        this.collapsed.push(index);
      }
      return;
    }

    /* The room finishes dying OUT LOUD before anybody reviews it.
     * `AFTERMATH.enter` opens with `dialogue.play`, which replaces the queue
     * and cuts the active take — so transitioning the moment the last body
     * dropped clipped whoever was dying loudest mid-word and silently threw
     * away every cry still queued behind them (on most runs that was half of
     * `gasCrawling` and DeathMegatron's "Silent night"). Booski's
     * "Efficient." waits for the first beat of quiet, which is also the read
     * that line wants. The timeout clock below deliberately does not run
     * while lines are draining — it exists for a lab whose MONITOR lags, not
     * to cut off the scene's own writing. */
    if (this.dialogue.busy) return;

    /* The monitor is the authority on whether they are dead, not this file. */
    const signs = this.lab.lifeSigns;
    this.aftermathWait += dt;
    if (signs === 0 || signs === undefined || signs === null) {
      this.lifeSignsAtAftermath = signs ?? null;
      this.fsm.go(S.AFTERMATH);
      return;
    }
    if (this.aftermathWait >= LIFE_SIGNS_TIMEOUT) {
      this.lifeSignsAtAftermath = signs;
      this.lifeSignsTimedOut = true;
      this.fsm.go(S.AFTERMATH);
    }
  }
}

export {
  S, BEAT_OF, GAS_STAGES, COLLAPSE_ORDER, LAB_DOOR_CODE, DMT_GAS_TAUNTS,
};
