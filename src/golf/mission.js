/**
 * The morning, as a state machine.
 *
 * Beats run in order and each one owns what can happen during it. The rule the
 * whole file is built on: a beat advances because something in the world
 * finished — a ball stopped, a conversation ended, a player walked somewhere —
 * and never because a timer ran out on its own. A scene that moves on while
 * the player is still looking at his ball is a scene that is playing itself.
 *
 * The one exception is the group waiting for the player. They wait forever.
 * There is no shot clock at Silver Pines.
 */

import { CHARACTER_IDS } from '../core/campaign.js';
import { SURFACE, surfaceProps, scoreBand, toYards, toFeet } from './course.js';
import { Ball, BALL_STATE, solveShot } from './ball.js';
import { launchFor, getClub } from './clubs.js';
import { heightAt, surfaceAt, distanceToPin, isOnGreen } from './field.js';
import { Scorecard, MERCY_CAP } from './scorecard.js';
import { buildScripts, SEQUENCES, pastMissionBanter } from './script.js';
import { builtHoles, HOLE, layoutFor } from './hole.js';

const LOU = CHARACTER_IDS.LOU;
const RIPPIN = CHARACTER_IDS.RIPPINFLOW;
const ERIC = CHARACTER_IDS.ERIC;
const PROSPECT = CHARACTER_IDS.PROSPECT;
const CART_RETRIEVAL_DISTANCE = 38;

/**
 * How the other three get around between shots.
 *
 * `NPC_WALK` is the unhurried club walk they use near the green. `NPC_HUSTLE`
 * is what they do when the next lie is a long way off — on a 395-yard par 4 a
 * man whose drive finished a hundred and thirty metres short of the pin was
 * covering that at 1.65 m/s, which is eighty seconds of watching Eric walk,
 * once per shot, on the hole where the player is finished and waiting. Their
 * carts are on the hole with them; this is the pace of a man travelling with
 * one, and the gait cadence in `cast.js` already scales with speed so it reads
 * as a hustle rather than a glide.
 */
const NPC_WALK = 1.65;
const NPC_HUSTLE = 3.7;
const NPC_HUSTLE_FROM = 38;
/** How much quicker the group plays once the Prospect is already in. */
const CATCH_UP_PACE = 1.3;
const NPC_TEE_SOLUTION_CACHE = new Map();

/**
 * A right-handed golfer stands beside the ball with his shoulders parallel to
 * the target line. Keeping this in one pure helper prevents tee shots and
 * ready-golf approaches from drifting back to a front-facing stance.
 */
/**
 * Small, per-golfer nudge along the shot line so two men converging on the
 * same ball or the same pin never resolve to the literal same standing spot.
 *
 * Ready golf lets Eric, Lou and Rippin all be playing at once (`
 * _playNpcApproaches`), and a straggler's very last stroke aims dead at
 * `HOLE.pin` (`_strikeNpcApproach`) rather than a scattered near-pin point —
 * on a hole where two of them finish close together (Hole 2 was the one this
 * was caught on) that put Eric and Rippin's stances within centimetres of
 * each other and their models walked into one another over the last putt.
 * Distinct, non-zero offsets per character keep every navigation target this
 * function hands out apart even when the inputs it is called with coincide.
 */
const STANCE_SPREAD = Object.freeze({ [ERIC]: -0.55, [RIPPIN]: 0.55, [LOU]: 0.20 });

export function golfStanceFor(ball, target, distance = 0.72, id = null) {
  const dx = (target?.x ?? ball.x) - ball.x;
  const dz = (target?.z ?? ball.z - 1) - ball.z;
  const shotYaw = Math.atan2(dx, dz);
  const offset = Math.max(0.45, Number.isFinite(distance) ? distance : 0.72);
  const spread = STANCE_SPREAD[id] ?? 0;
  return {
    x: ball.x - Math.cos(shotYaw) * offset + Math.sin(shotYaw) * spread,
    z: ball.z + Math.sin(shotYaw) * offset + Math.cos(shotYaw) * spread,
    yaw: shotYaw + Math.PI / 2,
    shotYaw,
  };
}

export const BEAT = {
  LOT: 'lot',
  WALK_TO_TEE: 'walk_to_tee',
  TEE_TALK: 'tee_talk',
  NPC_TEE: 'npc_tee',
  PLAYER_TEE: 'player_tee',
  TEE_RESULT: 'tee_result',
  CART: 'cart',
  APPROACH: 'approach',
  HOLE_OUT: 'hole_out',
  SCORECARD: 'scorecard',
  WALK_OFF: 'walk_off',
  /* Between holes: the card goes up, the world is torn down and rebuilt, and
   * the group walks onto the next tee. The only place in the round where the
   * player is not in control, and it lasts as long as a fade. */
  NEXT_TEE: 'next_tee',
  DONE: 'done',
};

/* Which hole this round is on, and what it is worth. Both come off the live
 * layout rather than being constants, because the round machine below runs
 * three times with different content and only these two numbers change. */

/** Order of play on the tee. The Prospect is last, always. */
const TEE_ORDER = [ERIC, RIPPIN, LOU];

/* What each man is called in the sequence table. The campaign ids are
 * `eric` and `rippinflow`; the script calls them Eric and Rippin, because
 * that is what the other three call them. One table, so the two spellings can
 * never drift apart again. */
const SCRIPT_KEY = {
  [ERIC]: 'eric',
  [RIPPIN]: 'rippin',
  [LOU]: 'lou',
};

/**
 * How many strokes each of them takes, per hole.
 *
 * Authored, because these scores are dialogue: Rippin's five on the first is
 * what the argument at the end is *about*, and Lou beating him from the fringe
 * is what "It's closer than yours" means. A hole may carry its own plan; this
 * is the fallback, and it is par for the two who can play and one over for the
 * one who cannot.
 */
function npcPlanFor(id) {
  const authored = HOLE.npcPlan?.[id];
  if (authored) return authored;
  const par = HOLE.par ?? 3;
  return { finish: id === RIPPIN ? par + 2 : par };
}

export class Round {
  /**
   * @param {object} o
   *   cues        CueQueue
   *   dialogue    Dialogue (the Bing's node tree)
   *   golfers     { [id]: Golfer }
   *   carts       CartPair
   *   audio       CourseAudio
   *   missions    campaign `state.missions`, for the conditional callbacks
   *   hooks       { onBeat, onStroke, onBallEvent, onToast, onEndCard }
   */
  constructor({
    cues, dialogue, golfers = {}, carts = null, audio = null,
    missions = {}, hooks = {},
  }) {
    this.cues = cues;
    this.dialogue = dialogue;
    this.golfers = golfers;
    this.carts = carts;
    this.audio = audio;
    this.hooks = hooks;
    this.card = new Scorecard();

    this.beat = BEAT.LOT;
    /* Only the holes that have been built. The card and the campaign already
     * know the round is three; this is what is actually playable today, so a
     * round ends cleanly on the last built hole rather than walking into a
     * tee that does not exist. */
    this.holes = builtHoles();
    this._t = 0;
    this._wait = 0;
    this._step = 0;
    this.hasBag = false;
    this.rodeWithLou = false;
    this.heardInvitation = false;
    this.memories = new Set();
    this.flags = new Set();

    /* Which conditional callbacks this save has earned, bucketed by where they
     * are allowed to happen. Computed once: a save cannot change mid-round. */
    this.callbacks = pastMissionBanter(missions);
    this._callbacksPlayed = new Set();

    this.balls = new Map();
    for (const id of [ERIC, RIPPIN, LOU, PROSPECT]) {
      this.balls.set(id, new Ball(this._ballHooks(id)));
    }
    this.playerBall = this.balls.get(PROSPECT);
    this.playerBall.placeAt(HOLE.teeMarks.ball.x, HOLE.teeMarks.ball.z);
    this._prepareNpcTeeShots();

    this.scripts = buildScripts({
      play: (id) => this.cues.play(id),
      playSequence: (name) => this.cues.playSequence(name),
      playCallbacks: (at) => this.playCallbacks(at),
      callbackHold: (at) => this.callbackHold(at),
      remember: (key) => this.memories.add(key),
      flag: (key) => {
        this.flags.add(key);
        if (key === 'heardInvitation') this.heardInvitation = true;
      },
    });

    this._npcIndex = 0;
    this._npcPhase = 'before';
    this.npcShotsSeen = false;
    this.skipRequested = false;
    this._resultPlayed = false;
    this._teeLunchPlayed = false;
    this._greenTalked = false;
    this._galleryTalked = false;
    this._galleryCheered = false;
    this._bunkerTalked = false;
    this._holeOutPlayed = false;
    this._npcApproachJobs = new Map();
    this._npcApproachDelay = new Map();
    this._approachShotPending = false;
    this._cartFromTee = true;
    /* Deferred calls ride the round's own clock rather than a real timer, so
     * pausing the game pauses them too. There is exactly one customer: the two
     * seconds of silence after a hole in one. */
    this._pending = [];
  }

  /** Run `fn` after `secs` of round time. */
  _after(secs, fn) {
    this._pending.push({ at: this._t + secs, fn });
  }

  _runPending() {
    for (let i = this._pending.length - 1; i >= 0; i--) {
      if (this._t >= this._pending[i].at) {
        const { fn } = this._pending.splice(i, 1)[0];
        fn();
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Ball plumbing                                                     */
  /* ---------------------------------------------------------------- */

  _ballHooks(id) {
    return {
      onLand: (surface, pos) => {
        this.audio?.land(surface, pos);
        this.hooks.onBallEvent?.('land', { id, surface, pos });
      },
      onBounce: (surface, impact, pos) => this.audio?.bounce(surface, impact, pos),
      onSplash: (pos) => {
        this.audio?.splash(pos);
        this.hooks.onBallEvent?.('splash', { id, pos });
      },
      onHoled: (pos) => {
        this.audio?.holed(pos);
        this.hooks.onBallEvent?.('holed', { id, pos });
      },
      onStop: (surface, pos) => this.hooks.onBallEvent?.('stop', { id, surface, pos }),
      onOutOfBounds: (pos) => this.hooks.onBallEvent?.('oob', { id, pos }),
    };
  }

  ballFor(id) { return this.balls.get(id); }

  /** The lie the player is about to hit off, for the HUD and for the swing. */
  playerLie() {
    const b = this.playerBall;
    return surfaceProps(surfaceAt(b.position.x, b.position.z));
  }

  playerSurface() {
    const b = this.playerBall;
    return surfaceAt(b.position.x, b.position.z);
  }

  distanceToPin() {
    const b = this.playerBall;
    return distanceToPin(b.position.x, b.position.z);
  }

  /* ---------------------------------------------------------------- */
  /* The player's shot                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * May he hit it right now?
   *
   * Not during `TEE_RESULT`. He has just hit, three men are saying something
   * about it, and the carts are on their way — letting him play the next shot
   * out of the tee box would skip the ride, which is the one part of the
   * morning the scene is actually for.
   */
  canAddress() {
    if (this.playerBall.moving) return false;
    if (this.playerBall.state === BALL_STATE.HOLED) return false;
    if (this.needsRelief()) return false;
    return this.beat === BEAT.PLAYER_TEE || this.beat === BEAT.APPROACH;
  }

  /**
   * Hit it.
   *
   * Every stroke the player plays comes through here — tee shot, chip, bunker
   * shot, putt — so the stroke count, the stats and the reaction all have one
   * place they are decided.
   */
  playerSwing({ club, power, accuracy, aim }) {
    if (!this.canAddress()) return null;
    const ball = this.playerBall;
    const surface = this.playerSurface();
    const lie = surfaceProps(surface);
    const launch = launchFor(club, { power, accuracy, lie });

    const before = { x: ball.position.x, z: ball.position.z };
    ball.strike(aim, launch);

    this.audio?.strike(club, surface, power, { ...ball.position });
    const wasTeeShot = this.beat === BEAT.PLAYER_TEE;
    this._shotContext = { club, surface, before, wasTeeShot };
    if (!wasTeeShot) this._approachShotPending = true;
    this.card.addStroke(PROSPECT, HOLE.number);
    if (surface === SURFACE.BUNKER) this.card.markBunker(PROSPECT, HOLE.number);
    this.hooks.onStroke?.(this.card.hole(PROSPECT, HOLE.number));

    if (this.beat === BEAT.PLAYER_TEE) {
      this.beat = BEAT.TEE_RESULT;
      this._resultPlayed = false;
      this.hooks.onBeat?.(this.beat);
    }
    return this._shotContext;
  }

  /**
   * Take the drop.
   *
   * One stroke, a legal spot, and no searching. Offered for water and out of
   * bounds automatically, and on demand for a ball that has got itself
   * somewhere a golf ball should not be — under a cart, inside a tree, below
   * the world. Nothing that happens to a ball may end the scene.
   */
  takeDrop(reason = 'water') {
    const ball = this.playerBall;
    const point = ball.dropPoint();
    ball.placeAt(point.x, point.z);
    this.card.addPenalty(PROSPECT, HOLE.number, reason);
    this.hooks.onStroke?.(this.card.hole(PROSPECT, HOLE.number));
    this.hooks.onToast?.(
      reason === 'oob' ? 'Out of bounds. Drop, plus one.' : 'Drop, plus one.',
    );
    return point;
  }

  /** Pick up a true tap-in. It still counts as the next stroke. */
  takeGimme() {
    const ball = this.playerBall;
    const distance = ball.distanceToPin();
    if (this.beat !== BEAT.APPROACH || ball.moving || ball.state === BALL_STATE.HOLED) {
      return { ok: false, reason: 'There is no tap-in to pick up.', distance };
    }
    if (distance > 0.8) {
      return { ok: false, reason: 'That is outside gimme range.', distance };
    }
    this.card.addStroke(PROSPECT, HOLE.number, { toPin: 0 });
    this.hooks.onStroke?.(this.card.hole(PROSPECT, HOLE.number));
    this._finishPlayerBall('Gimme. One stroke added.');
    return { ok: true, distance };
  }

  _finishPlayerBall(message = '') {
    const ball = this.playerBall;
    ball.placeAt(HOLE.pin.x, HOLE.pin.z);
    ball.state = BALL_STATE.HOLED;
    this._approachShotPending = false;
    this.card.finish(PROSPECT, HOLE.number);
    this.audio?.holed({ ...ball.position });
    if (message) this.hooks.onToast?.(message);
    this._go(BEAT.HOLE_OUT);
  }

  /** Does the ball need rescuing? Drives the [R] prompt. */
  needsRelief() {
    const b = this.playerBall;
    if (b.state === BALL_STATE.WATER || b.state === BALL_STATE.OUT_OF_BOUNDS) return true;
    if (b.moving) return false;
    return b.position.y < heightAt(b.position.x, b.position.z) - 0.8;
  }

  /**
   * Which written exchange to play, for this hole.
   *
   * `tee.arrival` on Hole 2 looks for `h2.tee.arrival` first and falls back to
   * the unprefixed name. So a hole overrides only the lines that are actually
   * different, and everything a round says the same way on every tee is
   * written once.
   */
  seq(name) {
    const own = `h${HOLE.number}.${name}`;
    return SEQUENCES[own] ? own : name;
  }

  /**
   * Is a driver the club this tee is for?
   *
   * Answered from the layout's own authored tee shot rather than from the
   * yardage, because that is the same number `shotPlan()` uses to put a
   * recommendation on screen. Anything that wants to say something about the
   * player's club choice has to ask this, or the scene ends up recommending a
   * driver and then complaining about the driver — which is exactly what it
   * was doing on both long holes.
   */
  /**
   * Which tee conversation this hole owns.
   *
   * All three tees used to open `firstTee` — the invitation, "So why am I
   * here?", and the same four replies including "You needed a fourth" — which
   * meant the scene's one irreplaceable exchange was asked and answered three
   * times in one round, twice of them to a man who already had the answer. The
   * gameplay spec makes the invitation a Hole 1 gate specifically; the other
   * two tees now ask their own question and gate on their own branch.
   */
  teeScript() {
    if (HOLE.number === 2 && this.scripts.secondTee) return this.scripts.secondTee;
    if (HOLE.number === 3 && this.scripts.thirdTee) return this.scripts.thirdTee;
    return this.scripts.firstTee;
  }

  wantsDriver() {
    const authored = HOLE.npcTeeShots?.[ERIC]?.club;
    if (authored) return authored === 'driver';
    return (HOLE.par ?? 3) >= 4;
  }

  /**
   * How hard the rest of the group is working right now.
   *
   * Once the Prospect's ball is in the cup the only thing left on the hole is
   * three men finishing, and the player is stood by the flag watching them do
   * it. So they get a thirty per cent move on — faster between shots and less
   * time stood over them — which is exactly what a group does when the man who
   * has holed out is waiting on them.
   */
  _groupPace() {
    return this.card.finished(PROSPECT, HOLE.number) ? CATCH_UP_PACE : 1;
  }

  /** Walking pace for one leg of an NPC's journey, and a hustle if it is far. */
  _travelSpeed(from, to) {
    const distance = from && to
      ? Math.hypot(to.x - from.x, to.z - from.z)
      : 0;
    const base = distance > NPC_HUSTLE_FROM ? NPC_HUSTLE : NPC_WALK;
    return base * this._groupPace();
  }

  /* ---------------------------------------------------------------- */
  /* Conditional callbacks                                             */
  /* ---------------------------------------------------------------- */

  playCallbacks(at) {
    let played = 0;
    for (const entry of this.callbacks) {
      if (entry.at !== at || this._callbacksPlayed.has(entry.id)) continue;
      this._callbacksPlayed.add(entry.id);
      this.cues.playSequence(entry.lines);
      played++;
      /* One per beat. A cart ride that recites his entire CV is a cart ride
       * nobody believes; Lou brings up one thing and moves on. */
      break;
    }
    return played;
  }

  callbackHold(at) {
    const entry = this.callbacks.find((e) => e.at === at && this._callbacksPlayed.has(e.id));
    return entry ? this.cues.lengthOf(entry.lines) + 0.5 : 0.4;
  }

  /* ---------------------------------------------------------------- */
  /* Beats                                                             */
  /* ---------------------------------------------------------------- */

  _go(beat) {
    if (this.beat === beat) return;
    this.beat = beat;
    this._t = 0;
    this._step = 0;
    this._wait = 0;
    this.hooks.onBeat?.(beat);
  }

  /** Start the morning. Called once the player has control. */
  begin() {
    this.cues.suppressBanter(true);
    this.dialogue.start(this.scripts.arrival, 'open', this.golfers[LOU]?.npc ?? null);
    this._go(BEAT.LOT);
  }

  /** He picked the bag up. Three clubs, and the joke that comes with them. */
  takeBag() {
    if (this.hasBag) return false;
    this.hasBag = true;
    this.audio?.bag(this.golfers[LOU]?.position);
    this.cues.playSequence(this.seq('lot.bag'));
    this.hooks.onToast?.('Driver, iron, putter.');
    this.hooks.onBag?.(true);
    return true;
  }

  /**
   * Restore only durable, completed-hole progress and return the next tee.
   * Mid-hole state is intentionally not serialized: reopening a tab starts a
   * clean hole, never a half-finished swing with missing world state.
   */
  restoreProgress(progress = {}) {
    const completed = Array.isArray(progress.holes) ? progress.holes : [];
    const valid = completed
      .filter((entry) => this.holes.includes(Number(entry?.hole)))
      .sort((a, b) => Number(a.hole) - Number(b.hole));

    for (const entry of valid) {
      const number = Number(entry.hole);
      const layout = layoutFor(number);
      for (const id of [ERIC, RIPPIN, LOU, PROSPECT]) {
        const h = this.card.hole(id, number);
        const authored = layout?.npcPlan?.[id]?.finish;
        h.strokes = id === PROSPECT
          ? Math.max(1, Math.round(Number(entry.strokes) || 1))
          : Math.max(1, Math.round(Number(authored) || (id === RIPPIN ? h.par + 2 : h.par)));
        h.penalties = id === PROSPECT
          ? Math.max(0, Math.round(Number(entry.penalties) || 0))
          : 0;
        h.finished = true;
        h.closestApproach = 0;
      }
    }

    this.heardInvitation = progress.heardInvitation === true;
    this.rodeWithLou = progress.rodeWithLou === true;
    this.hasBag = valid.length > 0;
    if (this.hasBag) this.hooks.onBag?.(true);
    const finished = new Set(valid.map((entry) => Number(entry.hole)));
    return this.holes.find((number) => !finished.has(number)) ?? null;
  }

  /** Skip NPC tee shots he has already watched. */
  requestSkip() {
    if (this.beat !== BEAT.NPC_TEE || !this.npcShotsSeen) return false;
    this.skipRequested = true;
    return true;
  }

  update(dt, playerPos) {
    this._t += dt;
    if (this._wait > 0) this._wait -= dt;
    this._runPending();

    for (const ball of this.balls.values()) {
      ball.update(dt);
      const trouble = ball.watchdog(dt);
      if (trouble && ball === this.playerBall) {
        /* The ball has done something a golf ball cannot recover from on its
         * own. Put it somewhere legal and tell him why, rather than leaving
         * him staring at a fairway with no ball on it. */
        const point = ball.dropPoint();
        ball.placeAt(point.x, point.z);
        this.hooks.onToast?.('Unplayable. Ball replaced.');
      }
    }

    switch (this.beat) {
      case BEAT.LOT: this._updateLot(dt, playerPos); break;
      case BEAT.WALK_TO_TEE: this._updateWalkToTee(dt, playerPos); break;
      case BEAT.TEE_TALK: this._updateTeeTalk(dt, playerPos); break;
      case BEAT.NPC_TEE: this._updateNpcTee(dt); break;
      case BEAT.PLAYER_TEE: break;      // waiting on him, for as long as it takes
      case BEAT.TEE_RESULT: this._updateTeeResult(dt); break;
      case BEAT.CART: this._updateCart(dt); break;
      case BEAT.APPROACH: this._updateApproach(dt, playerPos); break;
      case BEAT.HOLE_OUT: this._updateHoleOut(dt); break;
      case BEAT.SCORECARD: this._updateScorecard(dt); break;
      case BEAT.WALK_OFF: this._updateWalkOff(dt, playerPos); break;
      case BEAT.NEXT_TEE: break;   // main.js owns the fade, then calls startHole

      default: break;
    }
  }

  /* ---- the car park ---- */

  _updateLot(dt, playerPos) {
    if (this.dialogue.active) return;
    /* Arrival is over. He can look at the bag, the carts, the sign and the
     * scorecard for as long as he likes; nothing hurries him to the tee. */
    this.cues.suppressBanter(false);
    if (this.hasBag) this._go(BEAT.WALK_TO_TEE);
  }

  _updateWalkToTee(dt, playerPos) {
    if (!playerPos) return;

    /* The moment he sets off, so do they. Nobody is waiting in the car park
     * to be collected and nobody appears at the tee already standing there:
     * they walk it, and by the time he arrives they are arriving too. */
    if (!this._groupHeadingToTee
      && (!HOLE.lot
        || Math.hypot(playerPos.x - HOLE.lot.centre.x, playerPos.z - HOLE.lot.centre.z) > 13)) {
      this._groupHeadingToTee = true;
      for (const id of [LOU, RIPPIN, ERIC]) {
        this.golfers[id]?.walkTo(HOLE.teeMarks[id].x, HOLE.teeMarks[id].z, { speed: 1.7 });
      }
    }

    const d = Math.hypot(playerPos.x - HOLE.teeMarks.ball.x, playerPos.z - HOLE.teeMarks.ball.z);
    if (d < 9) {
      /* If he ran, they are still walking. The tee conversation waits for the
       * man whose line opens it rather than starting without him. */
      if (this.golfers[LOU]?.walking) return;
      this._go(BEAT.TEE_TALK);
      this.cues.playSequence(this.seq('tee.arrival'));
      this._wait = this.cues.lengthOf(this.seq('tee.arrival'));
      this.playCallbacks('tee');
    }
  }

  /* ---- the first tee ---- */

  _updateTeeTalk(dt, playerPos) {
    if (this._wait > 0 || this.cues.busy) return;
    if (this.dialogue.active) return;
    if (this._step === 0) {
      // "So why am I here?" — the centre of the scene, on the tee that owns it.
      this._step = 1;
      this.cues.suppressBanter(true);
      this.dialogue.start(
        this.teeScript(),
        'open',
        this.golfers[LOU]?.npc ?? null,
        { resume: true },
      );
      return;
    }
    /* Walking away ends the non-modal dialogue UI, but it cannot erase the
     * scene's central exchange. Keep the tee blocked and offer the unanswered
     * branch again only after the player walks back within speaking range. */
    if (this.dialogue.lastEndReason !== 'done') {
      const lou = this.golfers[LOU]?.group?.position;
      if (playerPos && lou && Math.hypot(playerPos.x - lou.x, playerPos.z - lou.z) < 5.5) {
        this.cues.suppressBanter(true);
        this.dialogue.start(
          this.teeScript(),
          'open',
          this.golfers[LOU]?.npc ?? null,
          { resume: true },
        );
      }
      return;
    }
    /* The completion reason belongs to this required tee exchange. Consume it
     * before later cart dialogue starts so a lapsed ride cannot be mistaken
     * for an unfinished invitation. */
    this.dialogue.lastEndReason = null;
    this.cues.suppressBanter(false);
    this._go(BEAT.NPC_TEE);
    this._npcIndex = 0;
    this._npcPhase = 'before';
    this.npcShotsSeen = false;
    this.skipRequested = false;
  }

  /* ---- Eric, Rippin, Lou ---- */

  _updateNpcTee(dt) {
    if (this._npcIndex >= TEE_ORDER.length) {
      this.npcShotsSeen = true;
      this._go(BEAT.PLAYER_TEE);
      const tee = HOLE.teeMarks.ball;
      this.audio?.tee({ x: tee.x, y: heightAt(tee.x, tee.z), z: tee.z });
      this.cues.playSequence(this.seq('tee.player.before'));
      return;
    }

    const id = TEE_ORDER[this._npcIndex];
    const golfer = this.golfers[id];
    const ball = this.balls.get(id);
    const key = SCRIPT_KEY[id];

    if (this.skipRequested) {
      // Fast-forward: resolve the shot instantly and move on.
      this._resolveNpcTeeShot(id, true);
      this._npcIndex++;
      this._npcPhase = 'before';
      if (this._npcIndex >= TEE_ORDER.length) this.skipRequested = false;
      return;
    }

    switch (this._npcPhase) {
      case 'before': {
        this.cues.playSequence(this.seq(`tee.${key}.before`));
        this._wait = this.cues.lengthOf(this.seq(`tee.${key}.before`));
        this._npcPhase = 'address';
        break;
      }
      case 'address': {
        if (this._wait > 0) break;
        // He walks up to the ball. Nobody appears over it.
        if (!this._steppedUp) {
          this._steppedUp = true;
          const spec = HOLE.npcTeeShots[id];
          const stance = golfStanceFor(HOLE.teeMarks.ball, spec.target ?? HOLE.pin);
          golfer?.setClub(spec.club);
          golfer?.walkTo(stance.x, stance.z, { speed: 1.4 });
          break;
        }
        if (golfer?.walking) break;
        {
          const target = HOLE.npcTeeShots[id].target ?? HOLE.pin;
          const stance = golfStanceFor(HOLE.teeMarks.ball, target);
          golfer?.placeAt(golfer.position.x, golfer.position.z, stance.yaw);
        }
        golfer?.address();
        this._wait = 0.6 + (golfer?.practiceSwings ?? 0) * 1.0;
        this._npcPhase = 'swing';
        break;
      }
      case 'swing': {
        if (this._wait > 0 || golfer?.busy) break;
        golfer?.swing({ onImpact: () => this._resolveNpcTeeShot(id, false) });
        this._npcPhase = 'watch';
        break;
      }
      case 'watch': {
        if (ball.moving) break;
        if (this._wait > 0) break;
        this.cues.playSequence(this.seq(`tee.${key}.after`));
        this._wait = this.cues.lengthOf(this.seq(`tee.${key}.after`));
        this._npcPhase = 'settle';
        break;
      }
      case 'settle': {
        if (this._wait > 0 || this.cues.busy) break;
        // Back to his own spot on the tee box, on his own feet.
        golfer?.walkTo(HOLE.teeMarks[id].x, HOLE.teeMarks[id].z);
        /* One full shot has now been watched. From this point F may collapse
         * only the remaining tee shots; it can never skip the first one or
         * the authored exchange that brought the group here. */
        this.npcShotsSeen = true;
        this._npcIndex++;
        this._npcPhase = 'before';
        this._steppedUp = false;
        break;
      }
      default: break;
    }
  }

  /** Launch an NPC's authored tee shot for real. */
  _resolveNpcTeeShot(id, instant) {
    const spec = HOLE.npcTeeShots[id];
    const ball = this.balls.get(id);
    const from = { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z };
    const lie = surfaceProps(surfaceAt(from.x, from.z));

    const solved = this._npcTeeSolutions.get(id) ?? solveShot({
      from, target: spec.target, club: spec.club, lie, loftBias: spec.loftBias,
    });
    ball.placeAt(from.x, from.z);
    ball.strike(solved.aim, solved.launch);
    this.card.addStroke(id, HOLE.number);
    if (!instant) {
      this.audio?.strike(spec.club, surfaceAt(from.x, from.z), solved.power, { ...ball.position });
    }

    if (instant) {
      let t = 0;
      while (ball.moving && t < 45) { ball.update(1 / 120); t += 1 / 120; }
    }
    return solved;
  }

  /** Solve authored drives while the hole is loading, never at impact. */
  _prepareNpcTeeShots() {
    if (NPC_TEE_SOLUTION_CACHE.has(HOLE.number)) {
      this._npcTeeSolutions = NPC_TEE_SOLUTION_CACHE.get(HOLE.number);
      return;
    }
    this._npcTeeSolutions = new Map();
    const from = { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z };
    const lie = surfaceProps(surfaceAt(from.x, from.z));
    for (const id of TEE_ORDER) {
      const spec = HOLE.npcTeeShots?.[id];
      if (!spec) continue;
      this._npcTeeSolutions.set(id, solveShot({
        from, target: spec.target, club: spec.club, lie, loftBias: spec.loftBias,
      }));
    }
    NPC_TEE_SOLUTION_CACHE.set(HOLE.number, this._npcTeeSolutions);
  }

  /* ---- how his tee shot went ---- */

  _recordPlayerShotResult() {
    const ball = this.playerBall;
    const ctx = this._shotContext;
    const h = this.card.hole(PROSPECT, HOLE.number);
    const pin = ball.distanceToPin();
    const yards = toYards(ball.travelled);
    if (!ctx?.recorded) {
      if (yards > h.longestShot) h.longestShot = yards;
      if (pin < h.closestApproach) h.closestApproach = pin;
      if (isOnGreen(ball.position.x, ball.position.z) && h.strokes <= HOLE.par - 2) {
        this.card.markGreenInRegulation(PROSPECT, HOLE.number, true);
      }
      if (ctx) ctx.recorded = true;
    }
    return { h, pin, yards };
  }

  _updateTeeResult(dt) {
    const ball = this.playerBall;
    if (ball.moving) return;
    if (this._resultPlayed) {
      if (this.cues.busy || this._wait > 0) return;
      /* All four of them have now hit the first tee and the reaction to the
       * Prospect's shot has run itself out. Lou closes the tee box before
       * anybody gets in a cart -- Hole 1 only, and after every outcome branch,
       * because the line is about the morning rather than about the shot. */
      if (HOLE.number === 1 && !this._teeLunchPlayed) {
        this._teeLunchPlayed = true;
        this.cues.playSequence(this.seq('tee.lunch'));
        this._wait = this.cues.lengthOf(this.seq('tee.lunch'));
        return;
      }
      /* Water and out of bounds cost a stroke and get a legal drop before
       * anybody gets in a cart. */
      if (ball.state === BALL_STATE.WATER) this.takeDrop('water');
      else if (ball.state === BALL_STATE.OUT_OF_BOUNDS) this.takeDrop('oob');
      this._startCartRide();
      return;
    }

    this._resultPlayed = true;
    const ctx = this._shotContext ?? {};
    const surface = ball.surface;
    const { pin } = this._recordPlayerShotResult();

    /**
     * Which reaction the tee shot earns.
     *
     * The order is the priority order and every line of it is load-bearing.
     * `driver_long` is Lou's "You brought the wrong club", and it used to be
     * reached by `club === 'driver' && travelled > 175` with nothing else in
     * the test — which is a correct description of Hole 1, a 167-yard par 3
     * where a driver genuinely is too much club, and a completely wrong
     * description of the other two. Measured: Hole 2 is a 520-yard par 5 and a
     * driver carries 250 m / 273 yds; Hole 3 is a 395-yard par 4 and it goes
     * 219 m / 239 yds. Both cleared 175, both fired the line, and both holes
     * open on `driver` as their own authored safe club — so the scene told the
     * player he had brought the wrong club for playing exactly the shot the
     * hole had just recommended.
     *
     * `wantsDriver()` reads that authored answer rather than guessing from the
     * yardage, so the predicate and the tee's own suggestion can never
     * disagree again. On a hole that does want a driver, a big one off the tee
     * now gets its own reaction instead of an insult.
     */
    let sequence = 'tee.result.rough';
    const bigDrive = ctx.club === 'driver' && ball.travelled > 175;
    if (ball.state === BALL_STATE.HOLED) sequence = 'tee.result.ace';
    else if (ball.state === BALL_STATE.WATER) sequence = 'tee.result.water';
    else if (ctx.club === 'putter' && ctx.wasTeeShot) sequence = 'tee.result.putter';
    else if (bigDrive && !this.wantsDriver()) sequence = 'tee.result.driver_long';
    else if (surface === SURFACE.BUNKER) sequence = 'tee.result.bunker';
    else if (surface === SURFACE.GREEN) {
      sequence = toFeet(pin) <= 15 ? 'tee.result.great' : 'tee.result.green';
    } else if (surface === SURFACE.FRINGE) sequence = 'tee.result.fringe';
    else if (bigDrive && this.wantsDriver()) sequence = 'tee.result.driver_good';
    else if (surface === SURFACE.FAIRWAY) sequence = 'tee.result.fairway';

    /* The ace gets two full seconds of nobody saying anything first. The
     * silence is the joke and it is also the moment. */
    if (sequence === 'tee.result.ace') {
      this._wait = 2.0;
      this.cues.suppressBanter(true);
      this._after(2.0, () => this.cues.playSequence(this.seq('tee.result.ace')));
    } else {
      /* Through `seq()`, so a hole can answer its own tee shot. This was a
       * bare `playSequence(sequence)`, which meant every `hN.tee.result.*`
       * override written from here on would have been silently ignored. */
      this.cues.playSequence(this.seq(sequence));
      this._wait = 0.4;
    }
    this.hooks.onBallEvent?.('tee_result', { sequence, surface, pin });
  }

  /**
   * Everybody gets in.
   *
   * The Prospect drives with Lou beside him; Erican takes Rippin. That split is
   * the only reason the first cart is quiet enough for its private conversation.
   */
  _startCartRide() {
    this._go(BEAT.CART);
    this._cartFromTee = true;
    this._releaseCartRiders();
    this.carts?.stage();
    this.carts?.beginPlayerDrive({ follow: true });
    /* The Prospect has the wheel. Lou takes the passenger seat so the private
     * conversation still happens beside him instead of becoming a radio call. */
    this.golfers[LOU]?.sitInCart();
    this.golfers[ERIC]?.sitInCart();
    this.golfers[RIPPIN]?.sitInCart();
    this._rideAlong();
    this.audio?.cartMotor(true, this.carts?.lead.position);
    this.rodeWithLou = true;
    this.cues.suppressBanter(true);
    this.dialogue.start(this.scripts.cartRide, 'open', this.golfers[LOU]?.npc ?? null);
  }

  /* ---- the ride ---- */

  _updateCart(dt) {
    if (this.carts) {
      this.audio?.cartMotor(
        this.carts.rolling || this.carts.lead.moving,
        this.carts.lead.position,
      );
    }
    if (this._cartFromTee) this._rideAlong();

    /* The player owns this beat. It advances through leaveCart(), only after
     * the cart is stopped beside the live ball and Lou has finished. */
  }

  cartDistanceToBall() {
    if (!this.carts) return Infinity;
    return Math.hypot(
      this.carts.lead.position.x - this.playerBall.position.x,
      this.carts.lead.position.z - this.playerBall.position.z,
    );
  }

  /** Why E may or may not park the cart right now. */
  cartExitState() {
    if (this.beat !== BEAT.CART || !this.carts) {
      return { ok: false, reason: 'You are not in the cart.' };
    }
    if (this._cartFromTee && (this.dialogue.active || this.cues.busy)) {
      return { ok: false, reason: 'Stay with Lou until he finishes.' };
    }
    const distance = this.cartDistanceToBall();
    if (distance > 12) {
      return { ok: false, reason: 'Drive closer to your ball.', distance };
    }
    if (Math.abs(this.carts.lead.velocity) > 0.55) {
      return { ok: false, reason: 'Stop the cart before getting out.', distance };
    }
    return { ok: true, distance };
  }

  /** Park, return foot control and send every NPC to his own live ball. */
  leaveCart() {
    const state = this.cartExitState();
    if (!state.ok) return state;
    this.carts.parkPlayerCarts();
    this.audio?.cartMotor(false);
    this.cues.suppressBanter(false);
    this._go(BEAT.APPROACH);
    if (this._cartFromTee) {
      this._releaseCartRiders();
      for (const id of [LOU, ERIC, RIPPIN]) this.golfers[id]?.standUp();
      this._placeGroupAfterDrive();
      this._npcApproachJobs.clear();
      this._npcApproachDelay = new Map([[ERIC, 1.4], [LOU, 2.1], [RIPPIN, 2.8]]);
    }
    return { ok: true, distance: state.distance };
  }

  /** Put the player back in the nearby lead cart after a long later shot. */
  _startApproachTransit() {
    this._cartFromTee = false;
    this._go(BEAT.CART);
    this.carts?.beginPlayerDrive({ follow: false });
    this.audio?.cartMotor(true, this.carts?.lead.position);
  }

  /**
   * Keep the riders in their seats as the carts move.
   *
   * Lou has to actually be next to him for the length of the ride: he is the
   * speaker the conversation's range check is measured against, and a Lou left
   * standing on the tee is a Lou whose private conversation lapses fifteen
   * metres down the cart path.
   */
  _rideAlong() {
    if (!this.carts) return;
    const seat = (golfer, cart, which) => {
      if (!golfer || !cart?.occupants) return;
      /* The seat is where his backside is; the figure's origin is the floor
       * under it, so he is dropped by the height of a seated man. Attachment
       * is idempotent here because _rideAlong remains safe to call from the
       * update path without detaching and reparenting a rider every frame. */
      if (cart.occupants.object(which) !== golfer.group) {
        cart.occupants.attach(which, golfer.group, { drop: 0.92 });
      }
    };
    seat(this.golfers[LOU], this.carts.lead, 'passenger');
    seat(this.golfers[ERIC], this.carts.follow, 'driver');
    seat(this.golfers[RIPPIN], this.carts.follow, 'passenger');
  }

  /** Hand every moving rider back to the scene before a standing/walking pose. */
  _releaseCartRiders() {
    const releases = [
      [this.carts?.lead, 'passenger'],
      [this.carts?.follow, 'driver'],
      [this.carts?.follow, 'passenger'],
    ];
    for (const [cart, which] of releases) cart?.occupants?.release(which);
  }

  /**
   * Everybody gets out of the carts and walks to their own ball.
   *
   * They step out where the two carts actually stopped and then walk. Nobody
   * is teleported to a ball in front of the player, which is the difference
   * between three men playing golf and three men being repositioned.
   */
  _placeGroupAfterDrive() {
    const starts = {
      [LOU]: { cart: this.carts?.lead, seat: 'passenger' },
      [ERIC]: { cart: this.carts?.follow, seat: 'driver' },
      [RIPPIN]: { cart: this.carts?.follow, seat: 'passenger' },
    };
    for (const id of [ERIC, RIPPIN, LOU]) {
      const b = this.balls.get(id);
      const g = this.golfers[id];
      if (!b || !g) continue;
      const start = starts[id];
      const out = start?.cart?.exitWorld(start.seat);
      g.placeAt(out?.x ?? HOLE.cartPark.x, out?.z ?? HOLE.cartPark.z);
      const dx = HOLE.pin.x - b.position.x;
      const dz = HOLE.pin.z - b.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const to = {
        x: b.position.x - (dx / len) * 1.1,
        z: b.position.z - (dz / len) * 1.1,
      };
      g.walkTo(to.x, to.z, { speed: this._travelSpeed(g.position, to) });
    }
  }

  /* ---- near the green ---- */

  _updateApproach(dt, playerPos) {
    const ball = this.playerBall;

    const playerHole = this.card.hole(PROSPECT, HOLE.number);
    if (!ball.moving && ball.state !== BALL_STATE.HOLED && playerHole.strokes >= MERCY_CAP) {
      this._finishPlayerBall(`Lou picks it up. ${MERCY_CAP} goes on the card.`);
      return;
    }

    if (this._approachShotPending && !ball.moving) {
      this._recordPlayerShotResult();
      if (ball.state === BALL_STATE.HOLED) {
        this._approachShotPending = false;
      } else if (this.needsRelief()) {
        /* Relief owns the next action. Keep the pending route so the legal
         * drop can still enter transit when it finishes far from the player. */
        return;
      } else {
        const distance = playerPos
          ? Math.hypot(playerPos.x - ball.position.x, playerPos.z - ball.position.z)
          : 0;
        this._approachShotPending = false;
        if (this.carts && distance > CART_RETRIEVAL_DISTANCE) {
          this._startApproachTransit();
          return;
        }
      }
    }

    // Conversations that belong to a place rather than to a beat.
    if (!this._bunkerTalked && !ball.moving
      && surfaceAt(ball.position.x, ball.position.z) === SURFACE.BUNKER) {
      this._bunkerTalked = true;
      this.cues.playSequence(this.seq('bunker.together'));
    }
    /* The crew on the grille balcony notice him arriving. Only the last hole
     * has a gallery, and they only get one go at it. */
    if (!this._galleryTalked && playerPos && HOLE.gallery?.length) {
      const near = HOLE.gallery.some((mark) => (
        Math.hypot(playerPos.x - mark.x, playerPos.z - mark.z) < 34
      ));
      if (near) {
        this._galleryTalked = true;
        const center = HOLE.gallery.reduce((sum, mark) => ({
          x: sum.x + mark.x,
          z: sum.z + mark.z,
        }), { x: 0, z: 0 });
        this.audio?.enterGrille?.({
          x: center.x / HOLE.gallery.length,
          y: 2.4,
          z: center.z / HOLE.gallery.length,
        });
        this.cues.playSequence(this.seq('gallery.arrival'));
      }
    }

    if (!this._greenTalked && playerPos
      && Math.hypot(playerPos.x - HOLE.green.x, playerPos.z - HOLE.green.z) < HOLE.green.rx + 4) {
      this._greenTalked = true;
      this.cues.playSequence(this.seq('green.arrival'));
      this._afterGreenTalk = 1;
    } else if (this._afterGreenTalk === 1 && !this.cues.busy) {
      this._afterGreenTalk = 2;
      this.cues.playSequence(this.seq('green.big_night'));
      this.playCallbacks('green');
    }

    this._playNpcApproaches(dt);

    if (ball.state === BALL_STATE.HOLED) {
      this.card.finish(PROSPECT, HOLE.number);
      const cup = {
        x: HOLE.pin.x,
        y: heightAt(HOLE.pin.x, HOLE.pin.z),
        z: HOLE.pin.z,
      };
      this.audio?.pickup(cup);
      this.audio?.flag(cup);
      /* And the balcony says so, which is the only reason five men were built
       * standing between the last green and the building. */
      if (HOLE.gallery?.length && !this._galleryCheered) {
        this._galleryCheered = true;
        this.cues.playSequence(this.seq('gallery.holed'));
      }
      this._go(BEAT.HOLE_OUT);
    }
  }

  /**
   * The other three finishing, while the player plays.
   *
   * Ready golf: they do not queue up and wait for him, and he does not wait
   * for them. Each takes a shot on a timer toward its authored finish, and the
   * audio is positional so a shot that happens off screen is still something
   * he hears rather than something that silently happened.
   */
  _playNpcApproaches(dt) {
    /* Pick up anybody who has finished before deciding who plays next.
     * Without this a man whose authored last putt dropped is still on the
     * roster, and keeps playing, and is on two hundred and fifty-six. */
    this._finishStragglers();

    /* Each man owns his own live job. That is ready golf: all three can walk
     * to separate lies while the Prospect plays, but no one can swing until
     * his body has actually arrived at his ball. */
    for (const [id, job] of [...this._npcApproachJobs]) {
      if (this._updateNpcApproachJob(job, dt)) {
        this._npcApproachJobs.delete(id);
        this._npcApproachDelay.set(id, (1.6 + Math.random() * 1.4) / this._groupPace());
      }
    }

    for (const id of [ERIC, LOU, RIPPIN]) {
      if (this._npcApproachJobs.has(id)) continue;
      if (this.card.finished(id, HOLE.number)) continue;
      const ball = this.balls.get(id);
      if (ball.moving) continue;

      const delay = (this._npcApproachDelay.get(id) ?? 1.2) - dt;
      this._npcApproachDelay.set(id, delay);
      if (delay > 0) continue;

      const strokes = this.card.hole(id, HOLE.number).strokes;
      const plan = npcPlanFor(id);
      /* He has played his round. Anything still out here gets holed out on
       * the next pass rather than played again — nobody at Silver Pines is
       * taking a fifth putt while the Prospect waits. */
      if (strokes >= plan.finish) {
        (this._pendingHoleOut ??= new Set()).add(id);
        continue;
      }
      const from = { x: ball.position.x, z: ball.position.z };
      const surface = surfaceAt(from.x, from.z);
      const onGreen = surface === SURFACE.GREEN || surface === SURFACE.FRINGE;
      const club = onGreen ? 'putter' : 'iron';
      const stance = golfStanceFor(from, HOLE.pin, 0.72, id);
      const golfer = this.golfers[id];
      golfer?.setClub(club);
      golfer?.walkTo(stance.x, stance.z, {
        speed: this._travelSpeed(golfer?.position, stance),
      });
      this._npcApproachJobs.set(id, {
        id,
        phase: 'walk',
        club,
        /* Rippin keeps one rehearsal away from the tee; the others get on
         * with it. This preserves character without multiplying dead time. */
        practice: id === RIPPIN && !onGreen ? 1 : 0,
        timer: 0,
        stanceYaw: stance.yaw,
        isLast: false,
      });
    }
  }

  /** Advance one golfer's walk/address/swing/watch sequence. */
  _updateNpcApproachJob(job, dt) {
    const golfer = this.golfers[job.id];
    const ball = this.balls.get(job.id);
    if (!golfer || !ball) return true;

    if (job.phase === 'walk') {
      if (golfer.walking) return false;
      golfer.placeAt(golfer.position.x, golfer.position.z, job.stanceYaw);
      golfer.address({ practice: job.practice });
      job.phase = 'address';
      job.timer = 0.42;
      return false;
    }

    if (job.phase === 'address') {
      if (golfer.busy) return false;
      job.timer -= dt;
      if (job.timer > 0) return false;
      job.phase = 'swing';
      golfer.swing({
        onImpact: () => this._strikeNpcApproach(job),
        onDone: () => { job.phase = 'watch'; },
      });
      return false;
    }

    if (job.phase === 'swing' || ball.moving) return false;
    if (!job.isLast) {
      const at = surfaceAt(ball.position.x, ball.position.z);
      if (at === SURFACE.GREEN || at === SURFACE.FRINGE) golfer.markBall();
      else golfer.leanOnClub();
    }
    return true;
  }

  /** Launch the shot at the animation's impact frame, from the live lie. */
  _strikeNpcApproach(job) {
    if (job.launched) return;
    job.launched = true;
    const ball = this.balls.get(job.id);
    const from = { x: ball.position.x, z: ball.position.z };
    const surface = surfaceAt(from.x, from.z);
    const lie = surfaceProps(surface);
    const strokes = this.card.hole(job.id, HOLE.number).strokes;
    const plan = npcPlanFor(job.id);
    job.isLast = strokes + 1 >= plan.finish;
    const target = job.isLast
      ? { x: HOLE.pin.x, z: HOLE.pin.z }
      : this._nearPin(from, 1.1 + Math.random() * 1.4);
    /* Approach outcomes are not dialogue-critical coordinates; one correction
     * is accurate enough and keeps ready-golf swings under a frame budget. */
    const solved = solveShot({ from, target, club: job.club, lie, passes: 1 });
    ball.placeAt(from.x, from.z);
    ball.strike(solved.aim, solved.launch);
    this.card.addStroke(job.id, HOLE.number);
    this.audio?.strike(job.club, surface, solved.power, { ...ball.position });

    if (job.isLast) {
      this._pendingHoleOut = this._pendingHoleOut ?? new Set();
      this._pendingHoleOut.add(job.id);
    }
  }

  _nearPin(from, metres) {
    const dx = from.x - HOLE.pin.x;
    const dz = from.z - HOLE.pin.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: HOLE.pin.x + (dx / len) * metres, z: HOLE.pin.z + (dz / len) * metres };
  }

  /* ---- the hole is over ---- */

  _updateHoleOut(dt) {
    /* He is in. The other three are not, and they keep playing while he
     * stands there holding the flag — which is both how golf works and the
     * only thing that lets the hole end. */
    this._playNpcApproaches(dt);

    if (!this._holeOutPlayed) {
      this._holeOutPlayed = true;
      const result = this.card.result(PROSPECT, HOLE.number);
      const band = scoreBand(result.strokes, HOLE.par);
      this.cues.suppressBanter(true);
      this.cues.playSequence(this.seq(`hole.${band}`));
      this._wait = this.cues.lengthOf(this.seq(`hole.${band}`)) + 0.6;
      this.hooks.onBallEvent?.('hole_out', result);
      return;
    }

    if (this._wait > 0 || this.cues.busy) return;
    if (!this.card.allFinished(HOLE.number)) return;
    this._go(BEAT.SCORECARD);
    this.cues.playSequence(this.seq('end.scorecard'));
    this._wait = this.cues.lengthOf(this.seq('end.scorecard'));
  }

  /**
   * Nobody is left standing over a two-footer forever.
   *
   * An NPC whose authored last stroke lipped out is given the tap-in rather
   * than being simulated until it drops, because a hole that cannot end is a
   * worse bug than a hole where Eric got a gimme.
   */
  _finishStragglers() {
    for (const id of [ERIC, LOU, RIPPIN]) {
      if (this.card.finished(id, HOLE.number)) continue;
      const ball = this.balls.get(id);
      if (ball.moving) continue;
      if (ball.state === BALL_STATE.HOLED || this._pendingHoleOut?.has(id)) {
        /* The authored last stroke was already counted at impact. If the
         * deterministic solver leaves it on the lip, finish that same stroke
         * in the cup instead of inventing a remote tap-in. */
        if (ball.state !== BALL_STATE.HOLED) {
          ball.placeAt(HOLE.pin.x, HOLE.pin.z);
          ball.state = BALL_STATE.HOLED;
        }
        this.card.finish(id, HOLE.number);
        this.golfers[id]?.retrieveFromCup();
        this.audio?.holed({ ...ball.position });
        this._pendingHoleOut?.delete(id);
      }
    }
  }

  _updateScorecard(dt) {
    if (this._wait > 0 || this.cues.busy) return;
    this._go(BEAT.WALK_OFF);
    this.cues.suppressBanter(false);
    this.cues.playSequence(this.seq('end.walk_off'));
  }

  _updateWalkOff(dt, playerPos) {
    if (this.cues.busy) return;
    /* The card only goes up when he decides the hole is over: he has to walk
     * to the cart himself. Fading out on a man standing on a green is taking
     * the ending off him. */
    if (!playerPos) return;
    const cartPark = this.carts?.lead?.position ?? HOLE.cartPark;
    const d = Math.hypot(playerPos.x - cartPark.x, playerPos.z - cartPark.z);
    if (d >= 4.5) return;

    const finished = this.summary();
    this.hooks.onHoleComplete?.(finished, this.nextHoleNumber());

    if (this.nextHoleNumber() === null) {
      this._go(BEAT.DONE);
      this.hooks.onRoundComplete?.(this.roundSummary());
      return;
    }
    this._go(BEAT.NEXT_TEE);
  }

  /** The hole after this one, if the course has one built. */
  nextHoleNumber() {
    const i = this.holes.indexOf(HOLE.number);
    return i >= 0 && i + 1 < this.holes.length ? this.holes[i + 1] : null;
  }

  /**
   * Walk onto the next tee.
   *
   * Called by main.js once its fade is at full black, because this is where
   * the world is thrown away and rebuilt and nobody should watch that happen.
   */
  startHole(number) {
    this._releaseCartRiders();
    this.hooks.onLoadHole?.(number);
    this._prepareNpcTeeShots();

    for (const [id, ball] of this.balls) {
      void id;
      ball.placeAt(HOLE.teeMarks.ball.x, HOLE.teeMarks.ball.z);
    }
    for (const id of [LOU, RIPPIN, ERIC]) {
      const at = HOLE.teeMarks[id];
      if (at) this.golfers[id]?.placeAt(at.x, at.z, Math.PI);
      this.golfers[id]?.idle();
    }
    this.carts?.stage();

    this._npcIndex = 0;
    this._npcPhase = 'before';
    this._steppedUp = false;
    this._resultPlayed = false;
    this._teeLunchPlayed = false;
    this._greenTalked = false;
    this._galleryTalked = false;
    this._galleryCheered = false;
    this._bunkerTalked = false;
    this._holeOutPlayed = false;
    this._afterGreenTalk = 0;
    this._groupHeadingToTee = true;
    this._pendingHoleOut = new Set();
    this._npcApproachJobs.clear();
    this._npcApproachDelay.clear();
    this._pending.length = 0;
    this.cues.suppressBanter(false);

    this._go(BEAT.TEE_TALK);
    this.cues.playSequence(this.seq('tee.arrival'));
    this._wait = this.cues.lengthOf(this.seq('tee.arrival'));
    this.playCallbacks('tee');
    return number;
  }

  /* ---------------------------------------------------------------- */
  /* Reporting                                                         */
  /* ---------------------------------------------------------------- */

  summary() {
    const result = this.card.result(PROSPECT, HOLE.number);
    return {
      hole: HOLE.number,
      par: HOLE.par,
      ...result,
      heardInvitation: this.heardInvitation,
      rodeWithLou: this.rodeWithLou,
      choices: [...this.memories],
      callbacksHeard: [...this._callbacksPlayed],
      lines: this.card.lines(),
    };
  }

  /** Every hole he has finished, for the end of the round. */
  roundSummary() {
    const line = this.card.line(PROSPECT);
    return {
      holes: line.holes.filter((h) => h.finished).map((h) => ({
        hole: h.hole, par: h.par, strokes: h.strokes, penalties: h.penalties,
      })),
      strokes: line.strokes,
      toPar: line.toPar,
      label: line.label,
      lines: this.card.lines(),
      heardInvitation: this.heardInvitation,
      rodeWithLou: this.rodeWithLou,
    };
  }

  /** The payload the campaign keeps. Small on purpose. */
  persist() {
    const s = this.summary();
    return {
      hole: HOLE.number,
      par: HOLE.par,
      strokes: s.strokes,
      penalties: s.penalties,
      heardInvitation: this.heardInvitation,
      rodeWithLou: this.rodeWithLou,
      foundWater: s.foundWater,
      hitGreenInRegulation: s.hitGreenInRegulation,
    };
  }
}

export { SEQUENCES };
