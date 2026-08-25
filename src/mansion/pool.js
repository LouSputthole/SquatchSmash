/**
 * Pool, played at the table rather than on a screen.
 *
 * `src/bing/blackjack.js` is the house precedent and this follows its shape
 * deliberately: the game happens at the real furniture, with the real balls as
 * real objects on the real felt, the camera drops to the shot instead of
 * opening a screen, ONE key gets you out at any point, and the house carries
 * on around the table whether or not you are winning. Squatch Smash is
 * full-screen because it is diegetically a PC game; a billiard table is
 * furniture, so there is no overlay mode in here and there must not be one.
 *
 * WHAT THIS MODULE IS NOT ALLOWED TO KNOW ABOUT. No THREE, no DOM, no audio
 * engine. It takes plain numbers, and it drives whatever meshes the scene
 * hands it through `attach()` by setting `.position`/`.rotation`/`.visible` on
 * them. That is what makes a full frame playable under `node --test`: the
 * physics below is the part that breaks silently in a browser (see the
 * sub-stepping note) and the part a headless test can actually pin down.
 *
 * THE RULES ARE A TABLE, NOT CODE. 8-BALL IS THE HOUSE GAME -- owner ruling,
 * confirmed rather than provisional. The table stays anyway, and so does the
 * one-line switch, because he wants to be able to FEEL both at the playtest
 * and a rules engine that can only be re-decided by a rewrite is a rules
 * engine that never gets re-decided. Everything that differs between the two
 * -- what you are allowed to hit, what ends the frame, what counts as a foul,
 * whether the incoming player gets the cue ball in his hand -- is a field in
 * POOL_RULE_SETS below, and `resolveShot` is one generic resolver reading
 * those fields.
 *
 * NO SPIN, NO ENGLISH, ON PURPOSE. Every ball is a point mass sliding on a
 * plane with rolling friction. There is no side, no draw, no follow and no
 * throw, and the balls do not even rotate about their own centres. This is
 * said out loud rather than left as an absence: a pool player WILL look for
 * screw-back, and the honest answer is that it is not in this version.
 *
 * THE POWER METER IS GOLF'S, NOT A THIRD ONE. Owner: "a power bar similar to
 * golf", and the standing note behind docs/REUSE-FIRST.md is that we keep
 * building a third of something the game already has twice. So the meter is
 * `Swing` out of ../golf/swing.js, unforked: two clicks, a dead zone, an
 * overswing band past `safePower`, and a signed timing error resolved into an
 * `accuracy` in [-1, 1]. What a cue could not take from a golf club is the
 * ARC -- a swing goes round a man and bends the ball in flight, a stroke
 * slides down a bridge hand in a straight line and the cue ball leaves in a
 * straight line -- so `accuracy` is read here as RADIANS OFF THE AIMED LINE
 * (MISCUE_RAD) rather than as shape, and golf's FADED/SLICED vocabulary
 * (`strikeLabel`) is left in golf where it means something. The rest is
 * shared, `SWING_CONTROL.cue` included.
 */

import { SWING_PHASE, Swing, npcSwing } from '../golf/swing.js';

/* ================================================================== */
/* THE TABLE, IN THE NUMBERS THE HOUSE WAS BUILT WITH                   */
/*                                                                       */
/* Read straight off `buildLounge` in scenes/MansionInterior.js: the bed  */
/* is 2.4 x 4.4 centred on (12.4, 48.6), the four rails sit at x +-1.28   */
/* and z +-2.27 and are 0.16 thick, so the inner faces -- the cushions a  */
/* ball actually hits -- are at 1.20 and 2.19. Everything here is         */
/* TABLE-LOCAL: +z is the head of the table (the end the player stands    */
/* at), -z is the foot (the end Rippinflow has been leaning on for twenty */
/* minutes), and the scene adds the centre back on.                       */
/* ================================================================== */
export const POOL_TABLE = Object.freeze({
  /** Ball radius. The rack already in the scene is built at this size. */
  ballRadius: 0.055,
  /** Inner cushion faces. */
  halfX: 1.2,
  halfZ: 2.19,
  /** Where a pocket swallows from. Corners at the rail junctions, two more
   * at the middle of each long cushion, which is what six pockets means. */
  pockets: Object.freeze([
    Object.freeze({ id: 'corner-foot-left', x: -1.2, z: -2.19, mouth: 0.098 }),
    Object.freeze({ id: 'corner-foot-right', x: 1.2, z: -2.19, mouth: 0.098 }),
    Object.freeze({ id: 'side-left', x: -1.2, z: 0, mouth: 0.086 }),
    Object.freeze({ id: 'side-right', x: 1.2, z: 0, mouth: 0.086 }),
    Object.freeze({ id: 'corner-head-left', x: -1.2, z: 2.19, mouth: 0.098 }),
    Object.freeze({ id: 'corner-head-right', x: 1.2, z: 2.19, mouth: 0.098 }),
  ]),
});

/** Half the playfield, measured to a BALL CENTRE rather than to the cushion. */
const LIMIT_X = POOL_TABLE.halfX - POOL_TABLE.ballRadius;
const LIMIT_Z = POOL_TABLE.halfZ - POOL_TABLE.ballRadius;
/** The foot and head spots: a quarter of the playfield in from each end. */
export const FOOT_SPOT_Z = -LIMIT_Z + (LIMIT_Z * 2) / 4;
export const HEAD_SPOT_Z = LIMIT_Z - (LIMIT_Z * 2) / 4;

/* ================================================================== */
/* THE BALLS, AUTHORED                                                  */
/*                                                                       */
/* NOT ONE Math.random IN THIS BLOCK OR THE ONE BELOW IT. The rack is a   */
/* layout the scene builds meshes at, and the geometry gate records the   */
/* bucket every authored position falls in; a random rack would make the  */
/* house a different house on every boot and the gate could never say     */
/* anything true about it. Rippinflow's HAND shakes at runtime (see       */
/* RIPPINFLOW below) -- the furniture does not.                           */
/* ================================================================== */

/** `group` is what the rules reason about; `colour` is what the scene paints. */
export const POOL_BALLS = Object.freeze([
  Object.freeze({ id: 0, group: 'cue', colour: 0xf4f0e6 }),
  Object.freeze({ id: 1, group: 'solid', colour: 0xd8b23a }),
  Object.freeze({ id: 2, group: 'solid', colour: 0x1c3d7a }),
  Object.freeze({ id: 3, group: 'solid', colour: 0x8a1a1a }),
  Object.freeze({ id: 4, group: 'solid', colour: 0x4a2270 }),
  Object.freeze({ id: 5, group: 'solid', colour: 0xd4651f }),
  Object.freeze({ id: 6, group: 'solid', colour: 0x1d6b34 }),
  Object.freeze({ id: 7, group: 'solid', colour: 0x6d2318 }),
  Object.freeze({ id: 8, group: 'eight', colour: 0x14141a }),
  Object.freeze({ id: 9, group: 'stripe', colour: 0xd8b23a }),
  Object.freeze({ id: 10, group: 'stripe', colour: 0x1c3d7a }),
  Object.freeze({ id: 11, group: 'stripe', colour: 0x8a1a1a }),
  Object.freeze({ id: 12, group: 'stripe', colour: 0x4a2270 }),
  Object.freeze({ id: 13, group: 'stripe', colour: 0xd4651f }),
  Object.freeze({ id: 14, group: 'stripe', colour: 0x1d6b34 }),
  Object.freeze({ id: 15, group: 'stripe', colour: 0x6d2318 }),
]);

const BALL_BY_ID = new Map(POOL_BALLS.map((ball) => [ball.id, ball]));
export const ballGroupOf = (id) => BALL_BY_ID.get(id)?.group ?? null;

/**
 * Rack rows, apex first, exactly as they are set on a real table.
 *
 * 8-ball is a legal rack and not merely a tidy one: the eight is the middle
 * ball of the third row, and the two back corners are one solid and one
 * stripe. 9-ball is the diamond with the one on the spot and the nine in the
 * middle. Both are written out ball by ball so the layout can be READ rather
 * than trusted to a shuffle.
 */
const RACK_ROWS = Object.freeze({
  'eight-ball': Object.freeze([
    Object.freeze([1]),
    Object.freeze([9, 2]),
    Object.freeze([10, 8, 3]),
    Object.freeze([11, 4, 12, 5]),
    Object.freeze([6, 13, 7, 14, 15]),
  ]),
  'nine-ball': Object.freeze([
    Object.freeze([1]),
    Object.freeze([2, 3]),
    Object.freeze([4, 9, 5]),
    Object.freeze([6, 7]),
    Object.freeze([8]),
  ]),
});

/** Centre-to-centre across a row, and row to row. A hair over a diameter so
 * the rack is not already overlapping on the frame it is built. */
const RACK_PITCH = POOL_TABLE.ballRadius * 2 + 0.0004;
const RACK_ROW_DZ = RACK_PITCH * 0.8660254;

/**
 * Every ball's starting place, in table-local metres.
 *
 * The diamond (9-ball) is the same triangle arithmetic with rows that shrink
 * again after the widest one, which is why the row lengths drive the x offset
 * rather than the row index.
 */
export function rackLayout(ruleSetId = 'eight-ball') {
  const rows = RACK_ROWS[ruleSetId];
  if (!rows) throw new Error(`no authored rack for rule set "${ruleSetId}"`);
  const out = [{ id: 0, x: 0, z: HEAD_SPOT_Z }];
  rows.forEach((row, rowIndex) => {
    const z = FOOT_SPOT_Z - rowIndex * RACK_ROW_DZ;
    row.forEach((id, column) => {
      out.push({ id, x: (column - (row.length - 1) / 2) * RACK_PITCH, z });
    });
  });
  return out;
}

/* ================================================================== */
/* THE RULES, AS DATA                                                   */
/* ================================================================== */

/**
 * What a frame of each game is, in fields.
 *
 * `resolveShot` below is the ONLY place these are read, and it has no `if
 * (ruleSet.id === ...)` in it. That is the whole point: the owner can change
 * his mind about the house game with THE SWITCH and nothing else moves.
 *
 *   target            'group'  each player owns solids or stripes
 *                     'lowest' the lowest ball on the table, always
 *   openTable         the groups are unowned until somebody pots one
 *   winBall           the ball that ends the frame
 *   winRequires       'groupCleared' -- you must be on it first
 *                     'none'         -- pot it any time and it is over
 *   earlyWinBall      what potting the win ball too soon does: 'loss' (8-ball,
 *                     the classic way to throw a frame away) or 'respot'
 *   fouls             which of the four standard fouls are on
 *   afterFoul         what the incoming player gets: 'headSpot' places the cue
 *                     ball for him, false leaves it where it stopped
 */
export const POOL_RULE_SETS = Object.freeze({
  'eight-ball': Object.freeze({
    id: 'eight-ball',
    name: '8-ball',
    target: 'group',
    openTable: true,
    winBall: 8,
    winRequires: 'groupCleared',
    earlyWinBall: 'loss',
    fouls: Object.freeze({
      cueBallPotted: true,
      noContact: true,
      wrongBallFirst: true,
      noRailAfterContact: true,
    }),
    afterFoul: 'headSpot',
  }),
  /* Same table, same physics, same cast, different table above. Nothing in
   * this file branches on which one is in play. */
  'nine-ball': Object.freeze({
    id: 'nine-ball',
    name: '9-ball',
    target: 'lowest',
    openTable: false,
    winBall: 9,
    winRequires: 'none',
    earlyWinBall: 'respot',
    fouls: Object.freeze({
      cueBallPotted: true,
      noContact: true,
      wrongBallFirst: true,
      noRailAfterContact: true,
    }),
    afterFoul: 'headSpot',
  }),
});

/** THE SWITCH. One line, and it is the only line.
 *
 * 8-ball SHIPS -- the owner ruled on it and it is not provisional. This stays
 * a switch so the other game can be felt at a playtest without a rewrite:
 * `POOL_RULE_SETS['nine-ball']` and nothing else moves. Rippinflow, the
 * physics, the rack, the referee and the panel all read the table. */
export const POOL_RULES = POOL_RULE_SETS['eight-ball'];

/* ================================================================== */
/* PHYSICS                                                              */
/* ================================================================== */

/**
 * THE FIXED SUB-STEP, AND WHY IT IS NOT NEGOTIABLE.
 *
 * This repo renders at about 1.3 frames a second under the software
 * rasteriser the browser gates run on, and every scene clamps `dt` to 0.05 s
 * (src/mansion/main.js's loop does exactly that). Integrate a break shot at
 * 0.05 s a go and the cue ball moves 28 cm between position samples -- five
 * ball radii -- so it passes clean through the pack and out through a cushion
 * and the frame is over before it started. Nothing about that failure looks
 * like a physics bug from the outside; it looks like balls disappearing.
 *
 * So the step is 1/240 s and a frame runs however many of those it owes. At
 * the clamp that is twelve, and at the top speed below one sub-step moves a
 * ball 2.3 cm -- under half a radius, which is the margin the collision pass
 * needs to never miss a contact. tests/mansion-pool.test.mjs drives a break
 * at dt = 0.05 and counts the balls afterwards, because that is the condition
 * that breaks the naive version and it is cheap to prove headlessly.
 */
export const SUB_DT = 1 / 240;
/** Cloth. Deceleration in m/s^2, not a per-frame multiplier -- a multiplier
 * would make the table slower on a slower machine. */
const ROLL_FRICTION = 1;
/** Below this a ball has stopped. Anything smaller and the frame never ends. */
const STOP_SPEED = 0.02;
const CUSHION_RESTITUTION = 0.72;
const BALL_RESTITUTION = 0.94;
/** Power 0..1 maps here. The cap is what keeps one sub-step under a radius. */
const MIN_STRIKE_SPEED = 0.7;
const MAX_STRIKE_SPEED = 5.4;
export const strikeSpeed = (power) => MIN_STRIKE_SPEED
  + Math.max(0, Math.min(1, power)) * (MAX_STRIKE_SPEED - MIN_STRIKE_SPEED);

/**
 * How far off the aimed line a completely botched stroke throws the cue ball.
 *
 * `accuracy` comes back from ../golf/swing.js in [-1, 1] and this is the only
 * place it becomes an angle. 0.05 rad is 2.9 degrees, which at a metre and a
 * half is an eight-centimetre miss -- comfortably wider than a pocket jaw, so
 * a full miss-time genuinely costs a pot, and comfortably short of nonsense,
 * so the cue ball still goes broadly where he pointed it. For scale it is
 * about twice RIPPINFLOW.aimError below, which is the intended reading: a
 * player who abuses the meter is worse than a decent opponent's shaking hand.
 */
export const MISCUE_RAD = 0.05;

/**
 * THE FORWARD STROKE, IN SIMULATED SECONDS.
 *
 * The cue used to be drawn BACK proportional to power and then teleport --
 * the impulse was instantaneous and the stick never travelled, which reads as
 * a cue lying on the table while the balls move by themselves. This is the
 * other half: accelerate through the ball, follow through, settle.
 *
 * EVERY NUMBER HERE IS SIMULATED TIME, NOT FRAMES, AND `draw` IS BIGGER THAN
 * THE SCENE'S dt CLAMP ON PURPOSE. src/mansion/main.js clamps dt to 0.05 s and
 * this scene renders at about 1.3 frames a second under the software
 * rasteriser, so one rendered frame advances the stroke by 0.05 s and no more.
 * A 0.16 s approach is therefore at least three drawn poses between the
 * address and the ball on the slowest box in the building; anything at or
 * under 0.05 s would be resolved inside a single update and the player would
 * never see the cue move at all. A frame counter would have the opposite
 * property -- correct on this box and a blur on a fast one -- which is why the
 * whole timeline is accumulated dt.
 *
 * `contactBack` is not authored: it is half the cue's own length plus a ball
 * radius, read off `meshes.cueLength`, so the tip arrives ON the ball rather
 * than at a number that agreed with the mesh on the day it was typed.
 */
export const CUE_STROKE = Object.freeze({
  /** Address to contact: the accelerating half of the stroke. */
  draw: 0.16,
  /** Contact to the deepest point of the follow-through. */
  follow: 0.14,
  /** And back to the address pose, unhurried, the way a man straightens up. */
  settle: 0.42,
  /** Cue-centre to ball-centre at the address, before the draw-back. */
  addressGap: 0.86,
  /** How much further back a full-power backswing pulls it. */
  drawSpan: 0.22,
  /** Follow-through past the ball: a floor, plus what the power adds. */
  followDepth: 0.05,
  followPower: 0.1,
  /** The cue this animation was proportioned against, if the scene is silent
   * about its own. MansionInterior.js publishes the real number. */
  fallbackCueLength: 1.45,
});

/** The whole timeline, for the settle test and for anything that has to wait
 * out a stroke without knowing its shape. */
export const CUE_STROKE_SECONDS = CUE_STROKE.draw + CUE_STROKE.follow + CUE_STROKE.settle;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Cue-centre to ball-centre while he is stood over it, drawn back by power. */
const addressBack = (power) => CUE_STROKE.addressGap
  + clamp(power, 0, 1) * CUE_STROKE.drawSpan;

/**
 * One sub-step of the whole table. Mutates `balls`; appends to `events`.
 *
 * Order matters and is the usual one: move, take the pockets (before the
 * cushions, or a ball entering a pocket mouth bounces off the cushion line
 * that is not there), take the cushions, then separate and resolve every
 * ball pair. Contacts are resolved by exchanging the component of velocity
 * along the line of centres, which for equal masses is the whole of an
 * elastic collision -- there is no mass field on a ball because they are all
 * the same ball.
 */
export function stepTable(balls, dt, events = []) {
  const r = POOL_TABLE.ballRadius;
  for (const ball of balls) {
    if (ball.potted) continue;
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed <= STOP_SPEED) {
      ball.vx = 0;
      ball.vz = 0;
      continue;
    }
    const drop = Math.min(speed, ROLL_FRICTION * dt);
    const scale = (speed - drop) / speed;
    ball.vx *= scale;
    ball.vz *= scale;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
  }

  for (const ball of balls) {
    if (ball.potted || (ball.vx === 0 && ball.vz === 0)) continue;
    for (const pocket of POOL_TABLE.pockets) {
      if (Math.hypot(ball.x - pocket.x, ball.z - pocket.z) > pocket.mouth) continue;
      ball.potted = true;
      ball.vx = 0;
      ball.vz = 0;
      events.push({ type: 'pocket', ball: ball.id, pocket: pocket.id, x: pocket.x, z: pocket.z });
      break;
    }
  }

  for (const ball of balls) {
    if (ball.potted) continue;
    if (ball.x < -LIMIT_X || ball.x > LIMIT_X) {
      ball.x = clamp(ball.x, -LIMIT_X, LIMIT_X);
      ball.vx = -ball.vx * CUSHION_RESTITUTION;
      events.push({ type: 'rail', ball: ball.id, x: ball.x, z: ball.z });
    }
    if (ball.z < -LIMIT_Z || ball.z > LIMIT_Z) {
      ball.z = clamp(ball.z, -LIMIT_Z, LIMIT_Z);
      ball.vz = -ball.vz * CUSHION_RESTITUTION;
      events.push({ type: 'rail', ball: ball.id, x: ball.x, z: ball.z });
    }
  }

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.potted) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.potted) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let distance = Math.hypot(dx, dz);
      if (distance >= r * 2) continue;
      /* Two balls racked exactly on top of each other would divide by zero and
       * take the whole table with them. Nudge along +x and carry on. */
      if (distance < 1e-6) {
        dx = 1;
        dz = 0;
        distance = 1e-6;
      }
      const nx = dx / distance;
      const nz = dz / distance;
      const overlap = r * 2 - distance;
      a.x -= nx * overlap * 0.5;
      a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.z += nz * overlap * 0.5;
      const approach = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (approach >= 0) continue;
      const impulse = -approach * 0.5 * (1 + BALL_RESTITUTION);
      a.vx -= impulse * nx;
      a.vz -= impulse * nz;
      b.vx += impulse * nx;
      b.vz += impulse * nz;
      events.push({
        type: 'ball',
        a: a.id,
        b: b.id,
        speed: -approach,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
      });
    }
  }
  return events;
}

/** Nothing is moving any more. */
export const tableStill = (balls) => balls.every((ball) => ball.potted
  || (ball.vx === 0 && ball.vz === 0));

/* ================================================================== */
/* THE REFEREE                                                          */
/* ================================================================== */

/** Which balls this shooter is allowed to strike first, from the rule table. */
export function legalTargets(rules, state, seat) {
  const live = state.balls.filter((ball) => !ball.potted && ball.id !== 0);
  if (rules.target === 'lowest') {
    const lowest = live.reduce((low, ball) => (low === null || ball.id < low ? ball.id : low), null);
    return lowest === null ? [] : [lowest];
  }
  const owned = state.groups[seat];
  if (!owned) {
    /* Open table: anything but the win ball. Hitting it first is a foul even
     * before anybody owns a group -- that is what "open" means, not "free". */
    return live.filter((ball) => ball.id !== rules.winBall).map((ball) => ball.id);
  }
  const mine = live.filter((ball) => ballGroupOf(ball.id) === owned);
  if (mine.length) return mine.map((ball) => ball.id);
  return live.some((ball) => ball.id === rules.winBall) ? [rules.winBall] : [];
}

/**
 * What that shot did, decided from the rule table and the shot report.
 *
 * `shot` is what the physics saw: `{ firstContact, railAfterContact, potted,
 * cueBallPotted }`. Returns the whole outcome so the caller can narrate it --
 * the mansion needs to know HOW a frame turned, not only who is on next, for
 * exactly the reason `Blackjack._settle` hands back a `kind`.
 */
export function resolveShot(rules, state, seat, shot) {
  const other = seat === 'player' ? 'rippin' : 'player';
  const targets = legalTargets(rules, state, seat);
  const potted = shot.potted.filter((id) => id !== 0);
  const wonBallPotted = potted.includes(rules.winBall);

  let foul = null;
  if (rules.fouls.cueBallPotted && shot.cueBallPotted) foul = 'cue ball';
  else if (rules.fouls.noContact && shot.firstContact === null) foul = 'no contact';
  else if (rules.fouls.wrongBallFirst && targets.length
    && !targets.includes(shot.firstContact)) foul = 'wrong ball first';
  else if (rules.fouls.noRailAfterContact && shot.firstContact !== null
    && !shot.railAfterContact && potted.length === 0) foul = 'no rail';

  /* The group assignment happens BEFORE the frame-ending test, so a player who
   * is handed solids by this very shot can be cleared to shoot at the eight by
   * the same shot that clears his last one. */
  const assigned = { ...state.groups };
  if (rules.openTable && !assigned[seat] && !foul) {
    const first = potted.find((id) => id !== rules.winBall);
    const group = first === undefined ? null : ballGroupOf(first);
    if (group) {
      assigned[seat] = group;
      assigned[other] = group === 'solid' ? 'stripe' : 'solid';
    }
  }

  if (wonBallPotted) {
    const cleared = rules.winRequires !== 'groupCleared'
      || legalTargetsAfter(rules, state, seat, assigned, shot) === 'win-ball';
    if (foul || !cleared) {
      if (rules.earlyWinBall === 'loss') {
        return {
          foul: foul ?? 'the win ball, early',
          frameOver: true,
          winner: other,
          reason: foul ? `${foul}, on the ${rules.winBall}` : `the ${rules.winBall} went early`,
          groups: assigned,
          respot: [],
          turn: other,
          ballInHand: false,
        };
      }
      return {
        foul: foul ?? 'the win ball, early',
        frameOver: false,
        winner: null,
        reason: `the ${rules.winBall} goes back on the spot`,
        groups: assigned,
        respot: [rules.winBall],
        turn: other,
        ballInHand: rules.afterFoul !== false,
      };
    }
    return {
      foul: null,
      frameOver: true,
      winner: seat,
      reason: `the ${rules.winBall}, called and gone`,
      groups: assigned,
      respot: [],
      turn: seat,
      ballInHand: false,
    };
  }

  if (foul) {
    return {
      foul,
      frameOver: false,
      winner: null,
      reason: foul,
      groups: assigned,
      respot: [],
      turn: other,
      ballInHand: rules.afterFoul !== false,
    };
  }

  /* A pot keeps you at the table -- but only a pot of something that was
   * yours to pot. On an open table any pot counts, because it is the pot that
   * decides whose group it was. */
  const mine = rules.target === 'lowest'
    ? potted.length > 0
    : potted.some((id) => !assigned[seat] || ballGroupOf(id) === assigned[seat]);
  return {
    foul: null,
    frameOver: false,
    winner: null,
    reason: mine ? 'pot, and stay at the table' : 'nothing down',
    groups: assigned,
    respot: [],
    turn: mine ? seat : other,
    ballInHand: false,
  };
}

/** Would this shooter be shooting at the win ball now? Used only to decide
 * whether the win ball was potted on time. */
function legalTargetsAfter(rules, state, seat, groups, shot) {
  const owned = groups[seat];
  if (!owned) return 'open';
  const before = state.balls.filter((ball) => !ball.potted
    && ball.id !== 0
    && ball.id !== rules.winBall
    && ballGroupOf(ball.id) === owned)
    .map((ball) => ball.id);
  const left = before.filter((id) => !shot.potted.includes(id));
  return left.length === 0 ? 'win-ball' : 'group';
}

/* ================================================================== */
/* RIPPINFLOW                                                           */
/* ================================================================== */

/**
 * How good he is, authored.
 *
 * He is Family, he has been standing at this table for twenty minutes, and he
 * is meant to be a real opponent rather than a coin flip -- he takes his shots
 * through the same `stepTable` the player does and he can miss. The numbers
 * are here rather than sprinkled through `chooseShot` so the owner can make
 * him harder or softer without reading the search.
 *
 *   aimError      radians of hand shake, applied at RUNTIME through the
 *                 injected rng. 0.026 rad is 1.5 degrees, which is about a
 *                 four-centimetre miss at a metre and a half -- most pockets
 *                 forgive it, a thin cut does not. THE SKILL IS AUTHORED AND
 *                 THE SHAKE IS RANDOM; the two are not the same thing.
 *   powerError    the same, on speed.
 *   takeIfScore   below this he does not fancy it and plays safe instead.
 *   thinkSeconds  he does not fire the instant it is his turn.
 */
export const RIPPINFLOW = Object.freeze({
  aimError: 0.026,
  powerError: 0.07,
  takeIfScore: 0.055,
  thinkSeconds: 1.9,
  safetyPower: 0.3,
});

const CUT_LIMIT = Math.cos(1.31);

/** Does anything else stand between these two points? */
function pathBlocked(balls, fromX, fromZ, toX, toZ, ignore) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return false;
  const nx = dx / length;
  const nz = dz / length;
  for (const ball of balls) {
    if (ball.potted || ignore.includes(ball.id)) continue;
    const along = (ball.x - fromX) * nx + (ball.z - fromZ) * nz;
    if (along <= 0 || along >= length) continue;
    const across = Math.abs((ball.x - fromX) * -nz + (ball.z - fromZ) * nx);
    if (across < POOL_TABLE.ballRadius * 2) return true;
  }
  return false;
}

/**
 * The shot he intends to play, before his hand gets involved.
 *
 * Ghost-ball geometry, which is how a person actually aims: put an imaginary
 * cue ball against the object ball on the far side from the pocket and shoot
 * at the middle of it. Every legal ball is tried into every pocket, thin cuts
 * and blocked paths are thrown out, and what survives is scored on being
 * straight and short -- which is the same order a decent club player picks in.
 */
export function chooseShot(rules, state, seat) {
  const cue = state.balls.find((ball) => ball.id === 0);
  const targets = legalTargets(rules, state, seat);
  const r = POOL_TABLE.ballRadius;
  let best = null;
  for (const id of targets) {
    const ball = state.balls.find((entry) => entry.id === id);
    if (!ball || ball.potted) continue;
    for (const pocket of POOL_TABLE.pockets) {
      const toPocket = Math.hypot(pocket.x - ball.x, pocket.z - ball.z);
      if (toPocket < 1e-6) continue;
      const ghostX = ball.x - ((pocket.x - ball.x) / toPocket) * r * 2;
      const ghostZ = ball.z - ((pocket.z - ball.z) / toPocket) * r * 2;
      const toGhost = Math.hypot(ghostX - cue.x, ghostZ - cue.z);
      if (toGhost < 1e-6) continue;
      const cut = ((ghostX - cue.x) / toGhost) * ((pocket.x - ball.x) / toPocket)
        + ((ghostZ - cue.z) / toGhost) * ((pocket.z - ball.z) / toPocket);
      if (cut < CUT_LIMIT) continue;
      if (pathBlocked(state.balls, cue.x, cue.z, ghostX, ghostZ, [0, id])) continue;
      if (pathBlocked(state.balls, ball.x, ball.z, pocket.x, pocket.z, [0, id])) continue;
      const score = (cut * cut) / (1 + toGhost * 0.35 + toPocket * 0.5);
      if (best && score <= best.score) continue;
      best = {
        score,
        target: id,
        pocket: pocket.id,
        angle: Math.atan2(ghostX - cue.x, ghostZ - cue.z),
        power: clamp(0.26 + (toGhost + toPocket) * 0.1, 0.24, 0.82),
      };
    }
  }
  if (best && best.score >= RIPPINFLOW.takeIfScore) return best;

  /* Nothing on. Roll up to the nearest legal ball hard enough to reach it and
   * no harder, which makes contact (so it is not a foul) and leaves the table
   * ugly. He is not trying to be clever; he is trying not to give it away. */
  let nearest = null;
  for (const id of targets) {
    const ball = state.balls.find((entry) => entry.id === id);
    if (!ball || ball.potted) continue;
    const distance = Math.hypot(ball.x - cue.x, ball.z - cue.z);
    if (nearest && distance >= nearest.distance) continue;
    nearest = { distance, angle: Math.atan2(ball.x - cue.x, ball.z - cue.z), target: id };
  }
  if (!nearest) return null;
  return {
    score: 0,
    safety: true,
    target: nearest.target,
    pocket: null,
    angle: nearest.angle,
    power: clamp(RIPPINFLOW.safetyPower + nearest.distance * 0.06, 0.24, 0.55),
  };
}

/* ================================================================== */
/* THE FRAME                                                            */
/* ================================================================== */

/** 'idle' — nobody is playing; 'aim' — the player is on; 'rolling' — balls are
 * moving; 'think' — Rippinflow is looking at it; 'over' — somebody won. */
export class PoolFrame {
  /**
   * @param {object} options
   * @param {object} options.rules     one of POOL_RULE_SETS. Defaults to THE SWITCH.
   * @param {() => number} options.rng runtime hand shake only. Injected so a
   *   test can hold his hand steady; NEVER used for a layout.
   * @param {object} options.hooks     { onEvent, onShot, onTurn, onFrameOver }
   */
  constructor({ rules = POOL_RULES, rng = Math.random, hooks = {} } = {}) {
    this.rules = rules;
    this.rng = rng;
    this.hooks = hooks;
    this.meshes = null;
    this.rack();
  }

  /** A fresh frame on the authored layout. */
  rack() {
    this.balls = rackLayout(this.rules.id).map((ball) => ({
      id: ball.id, x: ball.x, z: ball.z, vx: 0, vz: 0, potted: false,
    }));
    this.groups = { player: null, rippin: null };
    this.turn = 'player';
    this.state = 'idle';
    this.aimAngle = Math.PI;
    this.power = 0.6;
    this.message = 'Your break.';
    this.lastShot = null;
    this.shots = 0;
    this.winner = null;
    this.ballInHand = false;
    this._think = 0;
    this._shot = null;
    this._carry = 0;
    /* The meter and the stroke are per-frame state, not per-shot: racking
     * again with a half-swept bar left over would hand the next break a power
     * nobody chose. */
    this.swing = this.swing ?? new Swing({ club: 'cue' });
    this.swing.reset();
    this.lastSwing = null;
    this._stroke = null;
    this.syncMeshes();
  }

  /* ---------------------------------------------------------------- */

  /** The player picks the cue up. Returns false if he already has. */
  takeCue() {
    /* Coming back to a finished frame racks a new one. He asked for a game of
     * pool, not for a monument to the last one. */
    if (this.state === 'over') this.rack();
    if (this.state !== 'idle') return false;
    this.swing.reset();
    this.state = this.turn === 'player' ? 'aim' : 'think';
    if (this.turn === 'rippin') this._think = RIPPINFLOW.thinkSeconds;
    this.hooks.onTurn?.(this.turn, this.view);
    return true;
  }

  /** He puts it back down. The frame is LEFT WHERE IT IS on purpose: walking
   * away from a table mid-frame is a thing people do, and coming back to it is
   * better than being made to start again. */
  putCueBack() {
    /* WALKING AWAY MID-SHOT STILL FINISHES THE SHOT. Leaving `rolling` behind
     * would strand `_shot`, and the frame he came back to would be one where
     * the balls had moved and nobody had been penalised for it. The table does
     * not care that he stopped watching: run it out and let the referee speak.
     * Bounded, because a bug that leaves one ball with a velocity that never
     * decays must not become a hang on the way out of the room. */
    if (this.state === 'rolling') {
      /* HE WALKED OFF BETWEEN THE ADDRESS AND THE BALL. The shot is already
       * on the referee's book by then (`_shot` is open and `shots` has gone
       * up), but the cue ball has no velocity yet, so running the table out
       * from here would settle a shot in which nothing was ever hit and rule
       * it a foul for no contact. Land the tip first, then run it out. */
      this._contact();
      const events = [];
      for (let i = 0; i < 20000 && !tableStill(this.balls); i++) {
        stepTable(this.balls, SUB_DT, events);
      }
      for (const event of events) this._record(event);
      this._settle();
    }
    if (this.state !== 'over') this.state = 'idle';
    this.swing.reset();
    this._stroke = null;
    this.syncMeshes();
    this.hooks.onTurn?.(this.turn, this.view);
  }

  /** Where he is pointing, in table-local radians (0 is toward the foot). */
  aim(angle) {
    if (this.state !== 'aim') return;
    this.aimAngle = angle;
    this.syncMeshes();
  }

  setPower(power) {
    if (this.state !== 'aim') return;
    this.power = clamp(power, 0.04, 1);
  }

  /* ---------------------------------------------------------------- */
  /* THE METER                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * One click of the golf meter, at the table.
   *
   * First sets it sweeping, second sets the power, third sets the strike --
   * and the third one is the shot, which is why this fires it rather than
   * leaving the caller to notice. Returns the phase it moved into, the same
   * contract `Swing.click()` gives golf's `onClick`, or null if he is not on.
   */
  cueClick() {
    if (this.state !== 'aim' || this.turn !== 'player') return null;
    const phase = this.swing.click();
    if (phase === SWING_PHASE.DONE) this._fireSwing();
    else this.syncMeshes();
    return phase;
  }

  /** The power the cue is DRAWN BACK to right now. While the bar is still
   * sweeping that is the live marker rather than a power nobody has chosen
   * yet -- the same read golf's arms take (`swing.marker` in golf/main.js), so
   * the stick on the table and the bar on the panel are one thing. */
  get drawPower() {
    if (this.swing.phase === SWING_PHASE.POWER) return clamp(this.swing.marker, 0, 1);
    if (this.swing.phase === SWING_PHASE.STRIKE) return this.swing.power;
    return this.power;
  }

  _fireSwing() {
    const result = this.swing.result;
    this.lastSwing = {
      power: result.power,
      accuracy: result.accuracy,
      strike: result.strike,
      risk: result.risk,
      deadZone: result.deadZone,
    };
    this.swing.reset();
    /* The floor is the meter's, not the physics': letting the whole bar run
     * by is a tap, and a tap with no speed at all is a shot that cannot foul
     * and cannot end. */
    this.shoot({ power: Math.max(0.06, result.power), accuracy: result.accuracy });
  }

  /** Hit it. `power`, `angle` and `accuracy` override the held aim so a
   * headless driver can play a whole frame without a mouse. */
  shoot({ power = this.power, angle = this.aimAngle, accuracy = 0 } = {}) {
    if (this.state !== 'aim' || this.turn !== 'player') return false;
    this._strike(angle + accuracy * MISCUE_RAD, power, 'player', accuracy);
    return true;
  }

  _strike(angle, power, seat, accuracy = 0) {
    const cue = this.balls.find((ball) => ball.id === 0);
    if (cue.potted) this._placeCueBall();
    this.aimAngle = angle;
    this.power = power;
    this.ballInHand = false;
    this.state = 'rolling';
    this.shots++;
    this._shot = {
      seat, firstContact: null, railAfterContact: false, potted: [], cueBallPotted: false,
    };
    this._carry = 0;
    /* THE BALL DOES NOT MOVE ON THIS LINE ANY MORE, and that is the whole of
     * the forward stroke. `_contact()` below sets the velocity and rings the
     * `strike` cue when the tip actually arrives, CUE_STROKE.draw of simulated
     * seconds from now; until then `update()` holds the table still. The state
     * is already 'rolling' so nothing outside this file has to learn a new
     * one -- a shot is in progress from the instant he commits to it, which is
     * also true of a real one. */
    this._stroke = {
      t: 0, power, seat, accuracy, struck: false, addressBack: addressBack(this.drawPower),
      /* WHERE THE CUE BALL WAS WHEN HE HIT IT.
       *
       * `syncMeshes` used to place the cue relative to the cue ball's LIVE
       * position for the whole of `rolling`, so the moment the ball left, the
       * cue set off after it and rode down the table behind it until everything
       * stopped. Owner, twice: *"stick follows ball all the way through shot"*.
       * A cue stays where the man holding it is standing; the ball is the only
       * thing that goes anywhere. This is the address, frozen at commit. */
      ballX: cue.x,
      ballZ: cue.z,
    };
    this.hooks.onTurn?.(seat, this.view);
  }

  /** The tip lands. Idempotent, because `putCueBack()` can force it early. */
  _contact() {
    const stroke = this._stroke;
    if (!stroke || stroke.struck) return;
    stroke.struck = true;
    const cue = this.balls.find((ball) => ball.id === 0);
    const speed = strikeSpeed(stroke.power);
    cue.vx = Math.sin(this.aimAngle) * speed;
    cue.vz = Math.cos(this.aimAngle) * speed;
    this.hooks.onEvent?.({
      type: 'strike',
      seat: stroke.seat,
      speed,
      accuracy: stroke.accuracy,
      x: cue.x,
      z: cue.z,
    });
  }

  /** The cue ball goes back on the head spot, or the first clear place behind
   * it. Simplified ball-in-hand -- see the note in the README block of
   * src/mansion/main.js's pool section. */
  _placeCueBall() {
    const cue = this.balls.find((ball) => ball.id === 0);
    cue.potted = false;
    cue.vx = 0;
    cue.vz = 0;
    const step = POOL_TABLE.ballRadius * 2.2;
    for (let offset = 0; offset < 12; offset++) {
      for (const side of offset === 0 ? [0] : [-1, 1]) {
        const x = clamp(side * offset * step, -LIMIT_X, LIMIT_X);
        const z = HEAD_SPOT_Z;
        const clear = this.balls.every((ball) => ball.id === 0 || ball.potted
          || Math.hypot(ball.x - x, ball.z - z) > POOL_TABLE.ballRadius * 2.1);
        if (clear) {
          cue.x = x;
          cue.z = z;
          return;
        }
      }
    }
    cue.x = 0;
    cue.z = HEAD_SPOT_Z;
  }

  /* ---------------------------------------------------------------- */

  update(dt) {
    if (this.state === 'think') {
      this._think -= dt;
      if (this._think > 0) return;
      const shot = chooseShot(this.rules, this, 'rippin');
      if (!shot) {
        /* Nothing legal to hit at all. Rather than stand there, he taps it up
         * the table and concedes the foul, which is what the rules say
         * happens anyway. */
        this._strike(Math.PI, 0.3, 'rippin');
        return;
      }
      /* HIS SKILL IS STILL AUTHORED; ONLY THE SHAPE IS SHARED. `npcSwing` is
       * golf's own NPC result -- a clamped {power, accuracy} pair -- and it
       * was exported and used by nobody, which is the reuse complaint in
       * miniature. RIPPINFLOW.aimError stays in radians because that is the
       * unit a shaking hand is measured in, and dividing it by MISCUE_RAD
       * here is exact arithmetic, not a re-tune: `swung.accuracy *
       * MISCUE_RAD` below is the same shake to the last bit. The rng is
       * called angle-first, power-second, exactly as it was, so a seeded test
       * plays the same frame it played yesterday. */
      const shake = (this.rng() - 0.5) * 2 * RIPPINFLOW.aimError;
      const swung = npcSwing(
        clamp(shot.power * (1 + (this.rng() - 0.5) * 2 * RIPPINFLOW.powerError), 0.15, 1),
        shake / MISCUE_RAD,
      );
      this._strike(
        shot.angle + swung.accuracy * MISCUE_RAD, swung.power, 'rippin', swung.accuracy,
      );
      return;
    }
    if (this.state === 'aim') {
      /* The meter runs on the frame's own clock, like everything else in
       * here. It is deliberately NOT wall-clock: a click-stop-click bar is
       * only playable if the marker is where the last drawn frame showed it,
       * and at 1.3 fps a real-time sweep crosses the whole bar between two
       * paints. (The old hold-to-fill bar wanted the opposite and got it --
       * see the note this replaced in src/mansion/main.js.) */
      if (this.swing.active) {
        this.swing.update(dt);
        if (this.swing.phase === SWING_PHASE.DONE) this._fireSwing();
        else this.syncMeshes();
      }
      return;
    }
    if (this.state !== 'rolling') return;

    /* THE FORWARD STROKE OWES ITS TIME BEFORE THE TABLE DOES. Until the tip
     * lands there is nothing on the cloth to integrate, and settling here
     * would have the referee rule on a shot that has not been played yet. */
    const stroke = this._stroke;
    let budget = dt;
    if (stroke) {
      stroke.t += dt;
      if (!stroke.struck) {
        if (stroke.t < CUE_STROKE.draw) {
          this.syncMeshes();
          return;
        }
        /* Whatever of this frame's simulated time was left after the tip
         * arrived belongs to the balls, so contact inside a step is not a
         * step the table loses. */
        budget = stroke.t - CUE_STROKE.draw;
        this._contact();
      }
    }

    /* Whole sub-steps only, with the remainder carried into the next frame.
     * Dropping it would make the table quietly slower on a slow machine. */
    this._carry += budget;
    let steps = Math.floor(this._carry / SUB_DT);
    this._carry -= steps * SUB_DT;
    /* One frame can never owe more than this many. At the scene's dt clamp of
     * 0.05 s it owes twelve; the ceiling only matters if a tab was hidden and
     * something upstream handed us a whole second. */
    steps = Math.min(steps, 48);
    const events = [];
    for (let i = 0; i < steps && !tableStill(this.balls); i++) {
      stepTable(this.balls, SUB_DT, events);
    }
    for (const event of events) this._record(event);
    if (!tableStill(this.balls)) {
      this.syncMeshes();
      return;
    }
    this._settle();
  }

  _record(event) {
    const shot = this._shot;
    if (shot) {
      if (event.type === 'ball' && shot.firstContact === null
        && (event.a === 0 || event.b === 0)) {
        shot.firstContact = event.a === 0 ? event.b : event.a;
      }
      if (event.type === 'rail' && shot.firstContact !== null) shot.railAfterContact = true;
      if (event.type === 'pocket') {
        if (event.ball === 0) shot.cueBallPotted = true;
        else shot.potted.push(event.ball);
      }
    }
    this.hooks.onEvent?.(event);
  }

  _settle() {
    const shot = this._shot;
    this._shot = null;
    /* The stroke is over by now in every shot that took longer than
     * CUE_STROKE_SECONDS to run out, which is nearly all of them; dropping it
     * here rather than letting it hang means the cue is back at the address
     * for whoever is on next instead of frozen mid-follow-through. */
    this._stroke = null;
    this.swing.reset();
    const outcome = resolveShot(this.rules, this, shot.seat, shot);
    this.groups = outcome.groups;
    this.lastShot = { ...shot, ...outcome };
    for (const id of outcome.respot) {
      const ball = this.balls.find((entry) => entry.id === id);
      if (!ball) continue;
      ball.potted = false;
      ball.vx = 0;
      ball.vz = 0;
      ball.x = 0;
      ball.z = FOOT_SPOT_Z;
    }
    if (shot.cueBallPotted || outcome.ballInHand) this._placeCueBall();
    this.ballInHand = outcome.ballInHand;
    this.turn = outcome.turn;
    this.message = this._narrate(shot, outcome);
    if (outcome.frameOver) {
      this.state = 'over';
      this.winner = outcome.winner;
      this.syncMeshes();
      this.hooks.onShot?.(shot.seat, outcome, this.view);
      this.hooks.onFrameOver?.(outcome.winner, this.view);
      return;
    }
    this.state = this.turn === 'player' ? 'aim' : 'think';
    if (this.turn === 'rippin') this._think = RIPPINFLOW.thinkSeconds;
    this.syncMeshes();
    this.hooks.onShot?.(shot.seat, outcome, this.view);
    this.hooks.onTurn?.(this.turn, this.view);
  }

  _narrate(shot, outcome) {
    const who = shot.seat === 'player' ? 'You' : 'Rippinflow';
    if (outcome.frameOver) {
      return outcome.winner === 'player' ? 'Frame to you.' : 'Frame to Rippinflow.';
    }
    if (outcome.foul) return `${who}: foul — ${outcome.reason}.`;
    if (shot.potted.length) return `${who} potted ${shot.potted.join(', ')}.`;
    return `${who}: nothing down.`;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Hand over the meshes the scene built so the sim can move them.
   *
   * Deliberately duck-typed: anything with `.position.set` and `.visible`
   * works, so a node test can pass nothing at all and a browser can pass
   * THREE objects without this file importing THREE.
   */
  attach(meshes) {
    this.meshes = meshes;
    this.syncMeshes();
  }

  /**
   * How far behind the cue ball the cue's CENTRE sits this instant, in metres.
   *
   * Public because it is the whole of the stroke and the only honest way to
   * test it: the mesh position is this number times the aim vector, so a test
   * can watch the stroke without building a renderer.
   *
   * Address, then accelerate, then follow through, then settle. The approach
   * is u-squared because that is constant acceleration and a cue really does
   * arrive at the ball faster than it left the address; the follow-through is
   * its mirror, decelerating into the deepest point; the settle is a
   * smoothstep because a man straightening up does not stop dead.
   */
  cueBack(cueLength = CUE_STROKE.fallbackCueLength) {
    /* The tip on the ball, not a number that agreed with the mesh in 2026. */
    const contact = cueLength / 2 + POOL_TABLE.ballRadius;
    const address = addressBack(this.state === 'aim' ? this.drawPower : 0);
    const stroke = this._stroke;
    if (!stroke) return address;
    const { draw, follow, settle } = CUE_STROKE;
    const deepest = contact - (CUE_STROKE.followDepth + stroke.power * CUE_STROKE.followPower);
    if (stroke.t < draw) {
      const u = stroke.t / draw;
      return stroke.addressBack + (contact - stroke.addressBack) * u * u;
    }
    if (stroke.t < draw + follow) {
      const u = (stroke.t - draw) / follow;
      return contact + (deepest - contact) * (1 - (1 - u) * (1 - u));
    }
    const u = clamp((stroke.t - draw - follow) / settle, 0, 1);
    return deepest + (address - deepest) * u * u * (3 - 2 * u);
  }

  syncMeshes() {
    const meshes = this.meshes;
    if (!meshes) return;
    const { centre, ballY } = meshes;
    for (const ball of this.balls) {
      const node = meshes.balls?.get(ball.id);
      if (!node) continue;
      node.visible = !ball.potted;
      node.position.set(centre.x + ball.x, ballY, centre.z + ball.z);
    }
    const cue = this.balls.find((ball) => ball.id === 0);
    const aiming = this.state === 'aim' && !cue.potted;
    if (meshes.aimLine) {
      meshes.aimLine.visible = aiming;
      if (aiming) {
        const length = meshes.aimLength ?? 1.1;
        meshes.aimLine.position.set(
          centre.x + cue.x + Math.sin(this.aimAngle) * length * 0.5,
          ballY - POOL_TABLE.ballRadius + 0.004,
          centre.z + cue.z + Math.cos(this.aimAngle) * length * 0.5,
        );
        meshes.aimLine.rotation.y = this.aimAngle;
      }
    }
    if (meshes.cue) {
      const playing = this.state === 'aim' || this.state === 'think' || this.state === 'rolling';
      const rest = meshes.cueRest;
      if (playing && !cue.potted) {
        const back = this.cueBack(meshes.cueLength ?? CUE_STROKE.fallbackCueLength);
        /* Anchored to where the ball WAS when he committed, not to where it is
         * now. While he is aiming there is no stroke and the two are the same
         * point; the instant he shoots they part company, and it is the address
         * the cue belongs to. See the note on `_stroke.ballX`. */
        const stroke = this._stroke;
        const anchorX = stroke ? stroke.ballX : cue.x;
        const anchorZ = stroke ? stroke.ballZ : cue.z;
        meshes.cue.position.set(
          centre.x + anchorX - Math.sin(this.aimAngle) * back,
          ballY + 0.03,
          centre.z + anchorZ - Math.cos(this.aimAngle) * back,
        );
        /* YXZ so the yaw is applied OUTSIDE the 90-degree lay-flat rotation.
         * Under the default XYZ order the same numbers tip the cue up out of
         * the plane of the table instead of swinging it round. */
        meshes.cue.rotation.order = 'YXZ';
        meshes.cue.rotation.set(Math.PI / 2, this.aimAngle, 0);
      } else if (rest) {
        meshes.cue.rotation.order = 'XYZ';
        meshes.cue.rotation.set(rest.rotX, 0, rest.rotZ);
        meshes.cue.position.set(rest.x, rest.y, rest.z);
      }
    }
  }

  /** Everything a HUD or a verifier needs, and nothing it has to parse. */
  get view() {
    const live = this.balls.filter((ball) => !ball.potted && ball.id !== 0).map((ball) => ball.id);
    return {
      game: this.rules.name,
      state: this.state,
      turn: this.turn,
      groups: { ...this.groups },
      yours: this.groups.player,
      onTable: live,
      targets: legalTargets(this.rules, this, this.turn),
      aim: this.aimAngle,
      power: this.state === 'aim' ? this.drawPower : this.power,
      /* Everything the panel needs to draw the exact rule the shot will be
       * judged by -- the dead zone and the overswing band come out of the
       * swing itself rather than being a second set of numbers that agree
       * with it today. */
      swing: {
        phase: this.swing.phase,
        marker: this.swing.marker,
        power: this.swing.power,
        deadZone: this.swing.deadZone,
        safePower: this.swing.safePower,
        risk: this.swing.risk,
      },
      lastSwing: this.lastSwing,
      ballInHand: this.ballInHand,
      foul: this.lastShot?.foul ?? null,
      shots: this.shots,
      message: this.message,
      winner: this.winner,
    };
  }
}
