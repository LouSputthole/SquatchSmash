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
import { Scorecard } from './scorecard.js';
import { buildScripts, SEQUENCES, pastMissionBanter } from './script.js';
import { builtHoles } from './hole.js';
import { HOLE } from './hole.js';

const LOU = CHARACTER_IDS.LOU;
const RIPPIN = CHARACTER_IDS.RIPPINFLOW;
const ERIC = CHARACTER_IDS.ERICAN;
const PROSPECT = CHARACTER_IDS.PROSPECT;

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
 * `erican` and `rippinflow`; the script calls them Eric and Rippin, because
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
    this._greenTalked = false;
    this._bunkerTalked = false;
    this._holeOutPlayed = false;
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
    this._shotContext = { club, surface, before, wasTeeShot: this.beat === BEAT.PLAYER_TEE };
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
    if (this.beat === BEAT.TEE_RESULT && this._resultPlayed) this.beat = BEAT.APPROACH;
    return point;
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
    return true;
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
      // "So why am I here?" — the centre of the scene.
      this._step = 1;
      this.cues.suppressBanter(true);
      this.dialogue.start(this.scripts.firstTee, 'open', this.golfers[LOU]?.npc ?? null);
      return;
    }
    this.cues.suppressBanter(false);
    this._go(BEAT.NPC_TEE);
    this._npcIndex = 0;
    this._npcPhase = 'before';
  }

  /* ---- Eric, Rippin, Lou ---- */

  _updateNpcTee(dt) {
    if (this._npcIndex >= TEE_ORDER.length) {
      this.npcShotsSeen = true;
      this._go(BEAT.PLAYER_TEE);
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
          golfer?.setClub(HOLE.npcTeeShots[id].club);
          golfer?.walkTo(HOLE.teeMarks.ball.x - 0.55, HOLE.teeMarks.ball.z - 0.1, { speed: 1.4 });
          break;
        }
        if (golfer?.walking) break;
        golfer?.faceToward(HOLE.pin.x, HOLE.pin.z, true);
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

    const solved = solveShot({
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

  /* ---- how his tee shot went ---- */

  _updateTeeResult(dt) {
    const ball = this.playerBall;
    if (ball.moving) return;
    if (this._resultPlayed) {
      if (this.cues.busy || this._wait > 0) return;
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
    const pin = ball.distanceToPin();
    const yards = toYards(ball.travelled);

    this.card.markGreenInRegulation(PROSPECT, HOLE.number, isOnGreen(ball.position.x, ball.position.z));
    const h = this.card.hole(PROSPECT, HOLE.number);
    if (yards > h.longestShot) h.longestShot = yards;
    if (pin < h.closestApproach) h.closestApproach = pin;

    let sequence = 'tee.result.rough';
    if (ball.state === BALL_STATE.HOLED) sequence = 'tee.result.ace';
    else if (ball.state === BALL_STATE.WATER) sequence = 'tee.result.water';
    else if (ctx.club === 'putter' && ctx.wasTeeShot) sequence = 'tee.result.putter';
    else if (ctx.club === 'driver' && ball.travelled > 175) sequence = 'tee.result.driver_long';
    else if (surface === SURFACE.BUNKER) sequence = 'tee.result.bunker';
    else if (surface === SURFACE.GREEN) {
      sequence = toFeet(pin) <= 15 ? 'tee.result.great' : 'tee.result.green';
    } else if (surface === SURFACE.FRINGE) sequence = 'tee.result.fringe';

    /* The ace gets two full seconds of nobody saying anything first. The
     * silence is the joke and it is also the moment. */
    if (sequence === 'tee.result.ace') {
      this._wait = 2.0;
      this.cues.suppressBanter(true);
      this._after(2.0, () => this.cues.playSequence(this.seq('tee.result.ace')));
    } else {
      this.cues.playSequence(sequence);
      this._wait = 0.4;
    }
    this.hooks.onBallEvent?.('tee_result', { sequence, surface, pin });
  }

  /**
   * Everybody gets in.
   *
   * Lou drives the Prospect; Eric takes Rippin. That split is the only reason
   * the first cart is quiet enough for the conversation it exists to hold.
   */
  _startCartRide() {
    this._go(BEAT.CART);
    this.carts?.stage();
    this.carts?.driveToGreen();
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
    if (this.carts) this.audio?.cartMotor(this.carts.rolling, this.carts.lead.position);
    this._rideAlong();

    // The ride ends when the carts stop AND Lou has finished, not before.
    if (this.carts && !this.carts.arrived) return;
    if (this.dialogue.active || this.cues.busy) return;
    this.audio?.cartMotor(false);
    this.cues.suppressBanter(false);
    for (const id of [LOU, ERIC, RIPPIN]) this.golfers[id]?.standUp();
    this._go(BEAT.APPROACH);
    this._placeGroupNearGreen();
    this._npcPlayTimer = 1.4;
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
      if (!golfer) return;
      const s = cart.seatWorld(which);
      /* The seat is where his backside is; the figure's origin is the floor
       * under it, so he is dropped by the height of a seated man. */
      golfer.group.position.set(s.x, s.y - 0.92, s.z);
      golfer.group.rotation.y = cart.group.rotation.y;
    };
    seat(this.golfers[LOU], this.carts.lead, 'driver');
    seat(this.golfers[ERIC], this.carts.follow, 'driver');
    seat(this.golfers[RIPPIN], this.carts.follow, 'passenger');
  }

  /**
   * Everybody gets out of the carts and walks to their own ball.
   *
   * They are put down at the cart park — where the carts they rode in have
   * actually stopped — and then walk. Nobody is teleported to a ball in front
   * of the player, which is the difference between three men playing golf and
   * three men being repositioned between shots.
   */
  _placeGroupNearGreen() {
    const spread = [-1.6, 0, 1.6];
    let i = 0;
    for (const id of [ERIC, RIPPIN, LOU]) {
      const b = this.balls.get(id);
      const g = this.golfers[id];
      if (!b || !g) continue;
      g.placeAt(HOLE.cartPark.x + spread[i], HOLE.cartPark.z + 1.4 - i * 0.5);
      i++;
      const dx = HOLE.pin.x - b.position.x;
      const dz = HOLE.pin.z - b.position.z;
      const len = Math.hypot(dx, dz) || 1;
      g.walkTo(
        b.position.x - (dx / len) * 1.1,
        b.position.z - (dz / len) * 1.1,
        { speed: 1.5 },
      );
    }
  }

  /* ---- near the green ---- */

  _updateApproach(dt, playerPos) {
    const ball = this.playerBall;

    // Conversations that belong to a place rather than to a beat.
    if (!this._bunkerTalked && !ball.moving
      && surfaceAt(ball.position.x, ball.position.z) === SURFACE.BUNKER) {
      this._bunkerTalked = true;
      this.cues.playSequence(this.seq('bunker.together'));
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

    this._npcPlayTimer = (this._npcPlayTimer ?? 2) - dt;
    if (this._npcPlayTimer > 0) return;
    this._npcPlayTimer = 2.6 + Math.random() * 2.2;

    for (const id of [ERIC, LOU, RIPPIN]) {
      if (this.card.finished(id, HOLE.number)) continue;
      const ball = this.balls.get(id);
      if (ball.moving) return;

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
      const lie = surfaceProps(surface);
      const onGreen = surface === SURFACE.GREEN || surface === SURFACE.FRINGE;
      const club = onGreen ? 'putter' : 'iron';

      /* Their last authored stroke goes in; everything before it gets close.
       * This is what makes Eric two-putt for par and Rippin take five. */
      const isLast = strokes + 1 >= plan.finish;
      const target = isLast
        ? { x: HOLE.pin.x, z: HOLE.pin.z }
        : this._nearPin(from, 1.1 + Math.random() * 1.4);

      const solved = solveShot({ from, target, club, lie });
      ball.placeAt(from.x, from.z);
      ball.strike(solved.aim, solved.launch);
      this.card.addStroke(id, HOLE.number);
      this.audio?.strike(club, surface, solved.power, { ...ball.position });
      this.golfers[id]?.setClub(club);
      this.golfers[id]?.swing();

      /* A ball that was supposed to drop and did not still has to finish, or
       * the hole never ends. One tap-in, granted, and it is granted quietly. */
      if (isLast) {
        this._pendingHoleOut = this._pendingHoleOut ?? new Set();
        this._pendingHoleOut.add(id);
      }
      return;
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
        if (ball.state !== BALL_STATE.HOLED) this.card.addStroke(id, HOLE.number);
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
    const d = Math.hypot(playerPos.x - HOLE.cartPark.x, playerPos.z - HOLE.cartPark.z);
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
    this.hooks.onLoadHole?.(number);

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
    this._greenTalked = false;
    this._bunkerTalked = false;
    this._holeOutPlayed = false;
    this._afterGreenTalk = 0;
    this._groupHeadingToTee = true;
    this._pendingHoleOut = new Set();
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
