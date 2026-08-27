/**
 * INITIATION NIGHT — the shot list, in a shape something other than the
 * running scene can read.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE INCIDENT
 *
 * The whole of act five — the blade, the hand, the cut, the saint card, both
 * oath lines and the burning — played off screen for the entire life of this
 * scene. The ritual shot was a pair of fixed points: the camera at the table's
 * west end, aimed at `TABLE_SOCKETS.card`, the patch of tabletop the card is
 * picked *up* from. The player stands at `CEREMONY_CENTRE`, 2.4 m short of
 * that table, which does not merely put him off to one side of the look point
 * — it puts him behind the camera in z. So the act held a steady, well-lit
 * shot of an empty table while everything it is about happened behind the
 * lens. Nobody found it for as long as the scene existed, because the only way
 * to find it was to play it.
 *
 * `docs/FRAMING-GATE.md` is that fault turned into arithmetic, and the gate
 * has been finished and under test for a while with nothing to check, because
 * a shot in this game is authored as a closure over live rig nodes inside
 * `main.js` — a top-level WebGL boot script that cannot be imported without a
 * canvas — and no gate can read that.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS
 *
 * Two things, and the second is only trustworthy because of the first:
 *
 *   1. `INITIATION_SHOTS` — every camera mode's arithmetic, as a pure
 *      function of the state it depends on. `main.js`'s `CAMERA_SHOTS` calls
 *      straight through to these, so there is exactly ONE copy of where the
 *      ritual camera sits. A second copy written out for the gate to read
 *      would be a gate guarding a description of the scene rather than the
 *      scene, and the description would be right until the first time
 *      somebody moved a camera.
 *   2. `initiationFramingBeats(state)` — the published shot list the gate
 *      reads, one beat per phase-and-camera the scene actually holds on
 *      somebody, built by running those same functions.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SPEAKER, SUBJECT, AND WHY EVERY BEAT NAMES BOTH
 *
 * `speaker` is the man talking and it carries his HEAD, because the question
 * it answers is "can the player see him say it" — a frustum test.
 *
 * `subject` is what the shot is composed on, and every beat here sets it
 * explicitly rather than letting it default to the speaker. That is not
 * bookkeeping: these rigs stand 2.30 m to the middle of the head and the shots
 * are composed on chests at 1.2–2.2 m, so a shot correctly held on a man's
 * torso reads as a metre off his head and the aim check would fire on a
 * perfectly good shot. Composed on a body, `subject` is that body's TORSO
 * (measured: 1.62 m up the rig, times its scale). Composed on a thing — the
 * hand, a kneel mark, the mud — it is that thing.
 *
 * Where the shot is deliberately NOT on the man talking — the frontal on the
 * player while Booskibro questions him from nine metres off the frame, the
 * close on the hand while Lou speaks over it — the beat names the subject and
 * no speaker, and says why at the beat. A gate that reports a deliberate
 * choice as a defect gets switched off within a week.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THE GATE STILL REPORTS HERE, AND WHY IT IS NOT A DEFECT
 *
 * Ten findings survive a clean run of `npm run verify:framing` on this scene,
 * and every one of them is the same artifact. This site authors ALL of its
 * collision as `{x, z, r}` circles, and a circle carries no height, so
 * `normalizeSceneColliders` gives it the standing interaction band — −0.5 m to
 * 4 m — rather than inventing a height the builder never wrote. That is the
 * right conservative reading for a thing a player can walk into and the wrong
 * one for a thing a camera can see over:
 *
 *   - the cabin table is 0.78 m tall and its collider is 4.5 m, so every
 *     sightline across the room reads as blocked by it (`ceremony`,
 *     `ceremony-booski`, `ceremony-rippin`, `oath-question`, `oath-yes`);
 *   - the parked cars top out at 2.26 m, so a camera 3.6 m up beside one reads
 *     as inside it (`speech-start`) and a sightline over one reads as blocked
 *     (`cabin-door`, and Kittenboss past the boot car on the three wides that
 *     hold her).
 *
 * That is not reasoning: every one of those sightlines was cast against the
 * RENDERED geometry of both built states — 99 solid meshes in the clearing,
 * 349 in the cabin — and not one of them hits anything. The beats are left as
 * they are, with the speakers named, because the check they buy back the day
 * colliders carry heights is worth more than a quiet run today. `rawBounds` in
 * tools/verify-geometry-worker.mjs already honours `y0`/`y1` on a collider if
 * one is ever authored.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MEASURED, NOT REASONED
 *
 * Every rig offset in `RIG` came off the real `core/person.js` body in a
 * probe, and `tests/initiation-framing.test.mjs` re-measures all of them
 * against a real `Person` on every run. The day somebody makes the rig taller,
 * that test fails rather than this file quietly aiming at a chest that has
 * moved.
 */

import {
  CABIN,
  CABIN_DOOR,
  CEREMONY_CENTRE,
  KNEEL_MARKS,
  LINE_Z,
  LOU_SEAT,
  PLAYER_SLOT,
  PLAYER_EYE_Y,
  ROOM,
  STAND_MARK,
  TABLE,
  TRACK,
  TRAIL,
  blockingSlot,
  pointAlongPath,
} from './cabin/site.js';
import { SEAT_POSE, seatedBaseY } from './cabin/staging.js';
import { KITTENBOSS_SLOT, KNEELING_EXECUTIONS, LINE_UP } from './executions.js';

/* ------------------------------------------------------------------ */
/* THE RIG                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where the parts of a `core/person.js` body are, in its own space.
 *
 * All four numbers were measured off a built `Person` rather than read out of
 * the constructor, because the constructor's numbers are joint pivots and
 * these are the world offsets that come out the far end of the hierarchy. The
 * test re-measures them every run.
 *
 * `handX` is the sideways offset of a hand hanging at rest, and it is the one
 * that matters most here: the ritual camera is 0.6 m from that hand.
 */
export const RIG = Object.freeze({
  /** Middle of the head. The frustum test's "can you see him talk". */
  headY: 2.30,
  /** Middle of the torso. What a shot composed on a body is composed on. */
  torsoY: 1.62,
  /** A hand hanging at rest: this far up, and this far out to its own side. */
  handY: 1.07,
  handX: 0.51,
});

/**
 * The two heights the scene's own bodies stand at.
 *
 * Founders are built bigger, and Booskibro biggest — the numbers are
 * `main.js`'s, where the bodies are made. Everybody else is `0.96 + up to
 * 0.12` of random, so a non-founder's head is somewhere in 2.21–2.48 m; every
 * beat below uses 1.0 for them and the frustum margins are nowhere near tight
 * enough for the difference to decide anything.
 */
export const FIGURE_SCALE = Object.freeze({ booskibro: 1.22, founder: 1.12, member: 1.0 });

const vec = (x, y, z) => [x, y, z];

/** The head of a figure standing at a mark. */
export function standingHead({ x, z }, scale = 1) {
  return vec(x, RIG.headY * scale, z);
}

/** The middle of a figure standing at a mark: what a shot frames him on. */
export function standingTorso({ x, z }, scale = 1) {
  return vec(x, RIG.torsoY * scale, z);
}

/**
 * A hand hanging at rest on a figure standing at a mark, in world space.
 *
 * This is the ritual's subject. It is a rotation of one offset and nothing
 * more: a Person's heading is a yaw about +Y, and a point at local x rotates
 * to `(x·cos h, −x·sin h)` in world x and z.
 */
export function handAt({ x, z, heading = 0 }, side = 'L', scale = 1) {
  const local = (side === 'L' ? -RIG.handX : RIG.handX) * scale;
  return vec(x + local * Math.cos(heading), RIG.handY * scale, z - local * Math.sin(heading));
}

/**
 * The head of a figure sitting in a chair — Lou, for the first half of the
 * ceremony, and nobody else in this game.
 *
 * A seated pose drops the whole body to `seatedBaseY` and pitches the torso
 * back by `SEAT_POSE.bodyPitch`, so the head goes down and slightly BEHIND
 * where a standing head would be. Both come from `staging.js` rather than
 * being typed here, because the pose is that file's to define.
 */
export function seatedHead(seat, scale = 1, floorY = ROOM.floorY) {
  const pitch = SEAT_POSE.bodyPitch;
  const base = seatedBaseY(seat.cushion ?? 0.53, floorY);
  const heading = seat.heading ?? 0;
  /* A pitch about the figure's own x axis takes the head back along its own
   * −z (the pitch is negative), and the yaw turns that local offset into world
   * x and z: a point at local z rotates to `(z·sin h, z·cos h)`. */
  const back = RIG.headY * Math.sin(pitch) * scale;
  return vec(
    seat.x + back * Math.sin(heading),
    base + RIG.headY * Math.cos(pitch) * scale,
    seat.z + back * Math.cos(heading),
  );
}

/** The middle of a seated figure. Same reasoning, one joint lower. */
export function seatedTorso(seat, scale = 1, floorY = ROOM.floorY) {
  const pitch = SEAT_POSE.bodyPitch;
  const base = seatedBaseY(seat.cushion ?? 0.53, floorY);
  const heading = seat.heading ?? 0;
  const back = RIG.torsoY * Math.sin(pitch) * scale;
  return vec(
    seat.x + back * Math.sin(heading),
    base + RIG.torsoY * Math.cos(pitch) * scale,
    seat.z + back * Math.cos(heading),
  );
}

/* ------------------------------------------------------------------ */
/* THE SHOTS                                                           */
/*                                                                     */
/* One entry per name in `CAMERA_MODES`, and `main.js`'s `CAMERA_SHOTS`  */
/* calls every one of them. The comments about WHY a camera stands where */
/* it stands live at the call site in main.js, where the scene is.       */
/* ------------------------------------------------------------------ */

const add = (a, b, k = 1) => vec(a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k);

export const INITIATION_SHOTS = Object.freeze({
  /** Behind the shoulder, while he walks. `forward` is the smoothed cam yaw. */
  follow({ player, forward }) {
    const position = add(player, forward, -8.5);
    position[1] += 4.8;
    const lookAt = add(player, forward, 3);
    lookAt[1] += 1.8;
    return { position, lookAt };
  },

  /**
   * Down the line from its west end.
   *
   * IT USED TO STAND INSIDE THE WEST CAR. At `LINE_Z - 3.4` this camera sat at
   * (-8.6, 2.2, -11.4), which is inside that car's collision volume and 0.32 m
   * off its cabin roof — a lens 32 cm from painted metal, with a near plane of
   * 5 cm, on the shot that carries five of act one's and act two's beats
   * (`line_chat`, `line_chat_reply`, `after_one`, `exec_gap`,
   * `exec_gap_reply`). The gate found it the first run it could see this
   * scene; nothing else ever had. Moved a metre north: same lateral offset, so
   * the row still reads as a row with the headlights behind it, and 0.58 m of
   * clear air off the bodywork.
   */
  line() {
    return {
      position: vec(PLAYER_SLOT.x - 6.4, 2.2, LINE_Z - 2.4),
      lookAt: vec(1.6, 1.7, LINE_Z + 0.4),
    };
  },

  /** A slow creep in from off the west end. `k` runs 0 → 1 over 20 seconds. */
  speech({ k = 0 } = {}) {
    return {
      position: vec(-8.2 + k * 2.0, 3.6 - k * 0.7, -11.6 + k * 1.6),
      lookAt: vec(-2.4, 2.2, -6.2),
    };
  },

  /**
   * Side-on to Prospect One, wherever he is standing.
   *
   * THE SAME CAR, AND WORSE. This shot is relative to the man, and while he is
   * still in the row it put the camera at (-9.2, 2.0, -11.6) — inside the west
   * car's collision volume and EIGHT CENTIMETRES off its cabin. That is the
   * whole of `q1` and `q1_again`: the founders' first question and the man
   * asking for another go, filmed from inside the roof of a parked car. It
   * only came clear once he stepped out onto `STAND_MARK` for the shot itself,
   * which is why a playtest of the execution would never have shown it.
   *
   * The depth offset comes in from 3.6 to 2.4 and the lateral one is
   * untouched, so it is the same three-quarter front on him: 0.51 m of clear
   * air in the row, 1.18 m on the mark.
   */
  stand_exec({ victim }) {
    return {
      position: vec(victim[0] - 4.8, 2.0, victim[2] - 2.4),
      lookAt: vec(victim[0] + 0.4, 1.4, victim[2]),
    };
  },

  /** Frontal on the player, for the founders question. */
  q2({ player, facing }) {
    const position = add(player, facing, 5.2);
    position[0] += 1.2;
    position[1] = 2.1;
    const lookAt = vec(player[0], player[1] + 1.4, player[2]);
    return { position, lookAt };
  },

  /** Behind and above the line, out over the working ground. */
  clearing() {
    return {
      position: vec(PLAYER_SLOT.x - 1.2, 3.5, LINE_Z - 5.6),
      lookAt: vec(1.2, 1.2, -5.0),
    };
  },

  /** Over the line's shoulder at the mark in use. */
  kneel_exec({ mark }) {
    return {
      position: vec(PLAYER_SLOT.x - 1.9, 2.5, LINE_Z - 1.5),
      lookAt: vec(mark.x, 1.25, mark.z),
    };
  },

  /** Inside the cabin, on the head of the table. */
  room() {
    return {
      position: vec(CEREMONY_CENTRE.x - 2.4, 1.9, CEREMONY_CENTRE.z - 1.1),
      lookAt: vec(TABLE.x, 1.5, TABLE.z + 0.6),
    };
  },

  /** Close on Lou for the question. */
  oath() {
    return {
      position: vec(CEREMONY_CENTRE.x + 1.5, 1.75, CEREMONY_CENTRE.z - 0.2),
      lookAt: vec(LOU_SEAT.x, 1.65, LOU_SEAT.z - 0.4),
    };
  },

  /**
   * THE ONE THAT WAS BROKEN. Close and low on the hand, and the hand moves.
   *
   * The offsets are relative to where the hand actually is, which is the whole
   * of the fix: the shot cannot come off the subject because the subject is
   * what it is built from.
   */
  ritual({ hand }) {
    return {
      position: vec(hand[0] - 0.62, hand[1] + 0.28, hand[2] - 0.54),
      lookAt: vec(hand[0], hand[1], hand[2]),
    };
  },

  /** The slow orbit of the broken-open room, held on the player. */
  room_wide({ angle = 0, player }) {
    return {
      position: vec(
        CEREMONY_CENTRE.x + Math.cos(angle) * 2.6,
        1.85,
        CEREMONY_CENTRE.z + Math.sin(angle) * 1.4 - 0.6,
      ),
      lookAt: vec(player[0], player[1] + 1.55, player[2]),
    };
  },

  /** Out of the room, out of the window, back into the trees. `k` is 0 → 1. */
  pullback({ k = 0 } = {}) {
    const eased = k * k * (3 - 2 * k);
    return {
      position: vec(
        CEREMONY_CENTRE.x - 1.4 + eased * 2.0,
        1.85 + eased * 7.5,
        CEREMONY_CENTRE.z - 2.2 - eased * 26,
      ),
      lookAt: vec(CABIN.x, 1.6 + eased * 0.9, CABIN.z),
    };
  },

  /**
   * FAIL-B, and the fail card. Both hold exactly where the camera already is.
   *
   * They take the camera's own position and look point and hand them back, so
   * there is nothing to aim and nothing to check: the screen is black under
   * one of them and a full-screen card under the other. No beat is published
   * for either, for that reason.
   */
  black({ camera, look }) {
    return { position: [...camera], lookAt: [...look] };
  },
  hold({ camera, look }) {
    return { position: [...camera], lookAt: [...look] };
  },
});

/* ------------------------------------------------------------------ */
/* WHERE THE BODIES ARE                                                 */
/* ------------------------------------------------------------------ */

/**
 * The four stances in the clearing that a published beat needs.
 *
 * These are COPIES of `main.js`'s `CIRCLE` table, copied for the same reason
 * `cabin/site.js` copies the line-up's four numbers: this module has to be
 * readable by a gate that runs headless, and `main.js` is a top-level WebGL
 * boot script that cannot be imported without a canvas.
 * `tests/initiation-framing.test.mjs` parses that table out of the source and
 * asserts these still match it, so a body moved in one file fails a run rather
 * than leaving a beat quietly filming an empty patch of mud.
 *
 * Only the four who speak from a KNOWN position are here. Gratin and Seff
 * spend the executions walking, and where they stand while they work comes off
 * the kneel marks in `site.js` instead — measured data, not a copy.
 */
export const CLEARING_STANCES = Object.freeze({
  BOOSKIBRO: Object.freeze({ x: -6.4, z: -3.6, scale: FIGURE_SCALE.booskibro }),
  LOU: Object.freeze({ x: -7.8, z: -4.4, scale: FIGURE_SCALE.founder }),
  GRATIN: Object.freeze({ x: 1.6, z: -10.2, scale: FIGURE_SCALE.member }),
  /* Moved 0.7 m: his old mark was inside the treeline footprint. See
   * `cast.js`, which is now the one place the Circle's marks live. */
  SEFF: Object.freeze({ x: 2.77, z: -10.1, scale: FIGURE_SCALE.member }),
});

/**
 * Who stands on which slot of `site.js`'s BLOCKING once the room is full.
 *
 * Also a copy of `main.js`'s — `CABIN_BLOCKING` — and pinned by the same test.
 * The six members who stand out against the walls are deliberately not here:
 * their slots are `main.js`'s alone, they are all behind the player in a room
 * the camera is orbiting, and copying six more pairs of numbers to publish
 * beats about men standing behind the lens would buy nothing.
 */
export const CABIN_STANCES = Object.freeze({
  LOU: 'lou',
  BOOSKIBRO: 'booski',
  RIPPINFLOW: 'rippin',
  DEATHMEGATRON: 'ring-1',
  NUMBSKULL: 'ring-2',
  SHUBENATOR: 'ring-3',
  GRATIN: 'ring-4',
  SEFF: 'ring-5',
  APE: 'ring-6',
});

/** Where a prospect stands in the line, including Kittenboss on the end. */
export function lineSlot(id) {
  const slot = LINE_UP.find((entry) => entry.id === id);
  if (!slot) return null;
  return { x: slot.x, z: LINE_Z };
}

/** The player's own slot in the line. */
export const PLAYER_LINE_SLOT = Object.freeze({ x: PLAYER_SLOT.x, z: LINE_Z });

/** Kittenboss, four along, in front of the open boot. */
export const KITTENBOSS_LINE_SLOT = Object.freeze({ x: KITTENBOSS_SLOT.x, z: LINE_Z });

/* ------------------------------------------------------------------ */
/* THE PUBLISHED SHOT LIST                                              */
/* ------------------------------------------------------------------ */

/**
 * The player walks north up the track and the trail, so his facing is the
 * bearing of the path he is on. `pointAlongPath` already hands that back.
 */
function walkerAt(path, t) {
  const point = pointAlongPath(path, t);
  return {
    at: { x: point.x, z: point.z },
    forward: vec(Math.sin(point.heading), 0, Math.cos(point.heading)),
    heading: point.heading,
  };
}

/**
 * An over-the-shoulder beat.
 *
 * The follow shot looks three metres PAST the man it is following — that is
 * what over-the-shoulder means — so its subject is that composition point and
 * not the walker, and the aim check on it is therefore trivially satisfied.
 * The check that earns its keep here is `CAMERA_INSIDE_SOLID`: this camera
 * rides 8.5 m behind the player and 4.8 m up, through 36 m of unlit trail
 * with 249 cylinders of forest either side of it, and a lens inside a trunk is
 * a real and entirely invisible way for this walk to be broken.
 */
function followBeat({ id, phase, path, t, speaker = null, scale = 1 }) {
  const walker = walkerAt(path, t);
  const player = vec(walker.at.x, 0, walker.at.z);
  const shot = INITIATION_SHOTS.follow({ player, forward: walker.forward });
  return {
    id,
    phase,
    mode: 'follow',
    camera: { position: shot.position, lookAt: shot.lookAt },
    speaker: speaker ?? { id: 'player', point: standingHead(walker.at, scale) },
    subject: { id: `${id}:ahead`, point: shot.lookAt },
  };
}

/** Act one and two, in the clearing. */
function clearingBeats() {
  const beats = [];
  const kittenboss = { id: 'kittenboss', point: standingHead(KITTENBOSS_LINE_SLOT) };
  const player = { id: 'player', point: standingHead(PLAYER_LINE_SLOT) };
  /* What the wide of the line is composed on: the middle of the row, at chest
   * height on it. The row is six bodies and the shot is a wide of all six, so
   * naming any one of them as the subject would be a lie about the shot.
   *
   * The middle is the MEAN OF THE SIX, not `LINE_CENTER`. `LINE_CENTER` is the
   * middle of the four numbered prospects and predates Kittenboss being put on
   * the end of the row, so it sits 1.1 m west of where the bodies actually
   * average out — and a wide aimed at the middle of a row is the one thing
   * this subject is for. */
  const rowX = LINE_UP.reduce((sum, slot) => sum + slot.x, 0) / LINE_UP.length;
  const theLine = { id: 'the-line', point: vec(rowX, RIG.torsoY, LINE_Z) };

  beats.push(followBeat({
    id: 'approach', phase: 'approach', path: TRACK, t: 0.55,
  }));
  beats.push(followBeat({
    id: 'line-up', phase: 'line_up', path: TRACK, t: 1,
  }));

  /* KITTENBOSS, out of the side of her mouth, from the far end of the row. */
  beats.push({
    id: 'line-chat',
    phase: 'line_chat',
    mode: 'line',
    camera: INITIATION_SHOTS.line(),
    speaker: kittenboss,
    subject: theLine,
  });
  beats.push({
    id: 'line-chat-reply',
    phase: 'line_chat_reply',
    mode: 'line',
    camera: INITIATION_SHOTS.line(),
    speaker: player,
    subject: theLine,
  });

  /* The speech. Two beats, because this shot MOVES: it creeps in over twenty
   * seconds, and a camera that is fine where it starts and buried where it
   * ends is a fault this gate can only see if both ends are published. */
  for (const [id, k] of [['speech-start', 0], ['speech-end', 1]]) {
    beats.push({
      id,
      phase: 'speech',
      mode: 'speech',
    camera: INITIATION_SHOTS.speech({ k }),
      speaker: { id: 'booskibro', point: standingHead(CLEARING_STANCES.BOOSKIBRO, FIGURE_SCALE.booskibro) },
      subject: { id: 'the-clearing', point: vec(-2.4, RIG.torsoY, -6.2) },
    });
  }

  /* Prospect One: in the row while he is asked, out on the mark when he is
   * shot. Same camera mode, two entirely different places, and the shot
   * follows him — so both are published. */
  const oneInLine = lineSlot('prospect-one');
  for (const [id, phase, at] of [
    ['q1', 'q1', oneInLine],
    ['q1-again', 'q1_again', oneInLine],
    ['exec-one', 'exec_one', { x: STAND_MARK.x, z: STAND_MARK.z }],
  ]) {
    beats.push({
      id,
      phase,
      mode: 'stand_exec',
    camera: INITIATION_SHOTS.stand_exec({ victim: vec(at.x, 0, at.z) }),
      speaker: { id: 'prospect-one', point: standingHead(at) },
      subject: { id: 'prospect-one-body', point: standingTorso(at) },
    });
  }

  beats.push({
    id: 'after-one',
    phase: 'after_one',
    mode: 'line',
    camera: INITIATION_SHOTS.line(),
    speaker: kittenboss,
    subject: theLine,
  });

  /* The founders question is a FRONTAL ON THE PLAYER while Booskibro asks it
   * from nine metres off the side of the frame. That is the shot, deliberately
   * — the beat is his face while he answers — so it names its subject and no
   * speaker, because the man talking being out of frame is the point. */
  const playerFacing = vec(0, 0, 1);
  const playerAtSlot = vec(PLAYER_SLOT.x, 0, LINE_Z);
  for (const [id, phase] of [
    ['q2-intro', 'q2_intro'], ['q2-choice', 'q2_choice'],
    ['q2-result', 'q2_result'], ['q2-correct', 'q2_correct'],
  ]) {
    beats.push({
      id,
      phase,
      mode: 'q2',
    camera: INITIATION_SHOTS.q2({ player: playerAtSlot, facing: playerFacing }),
      subject: { id: 'player-body', point: standingTorso(PLAYER_LINE_SLOT) },
    });
  }

  /* The working ground, from behind the line. The conspiracy reveal is
   * spoken over it -- Lou and Booskibro trading IN-100 while the row stands
   * -- and Gratin and Seff are walking while they talk, so the beat is
   * published with the ground as the subject rather than a man mid-stride.
   * (This shot carried the old clear_line phase before the systems pass
   * folded that walk into the mass kneel.) */
  beats.push({
    id: 'clear-line',
    phase: 'conspiracy_reveal',
    mode: 'clearing',
    camera: INITIATION_SHOTS.clearing(),
    speaker: { id: 'booskibro', point: standingHead(CLEARING_STANCES.BOOSKIBRO, FIGURE_SCALE.booskibro) },
    subject: { id: 'the-mud', point: vec(1.2, RIG.torsoY, -5.0) },
  });
  /* THE SWEEP, ONE BEAT PER MARK. The systems pass runs the mass executions
   * as one looping phase, but the loop moves across four marks that run 5 m
   * over the mud — a shot that frames the first one and misses the last one
   * is exactly the kind of thing that survives a playtest of the first one.
   * The subject is the victim's head where `site.js` says it is when he is on
   * his knees. */
  for (const step of KNEELING_EXECUTIONS) {
    const mark = KNEEL_MARKS.find((entry) => entry.id === step.markId);
    beats.push({
      id: `sweep-${step.markId}`,
      phase: 'execution_sweep',
      mode: 'kneel_exec',
      camera: INITIATION_SHOTS.kneel_exec({ mark }),
      speaker: { id: `${step.markId}-shooter`, point: standingHead(mark.shooter) },
      subject: { id: `${step.markId}-head`, point: vec(mark.head.x, mark.head.y, mark.head.z) },
    });
  }

  /* Out of the clearing and onto the trail, still over the shoulder. */
  beats.push(followBeat({ id: 'walk-out', phase: 'walk_out', path: TRAIL, t: 0 }));
  beats.push(followBeat({ id: 'trail-early', phase: 'trail', path: TRAIL, t: 0.3 }));
  beats.push(followBeat({ id: 'trail-late', phase: 'trail', path: TRAIL, t: 0.6 }));
  beats.push(followBeat({ id: 'trail-reply', phase: 'trail_reply', path: TRAIL, t: 0.45 }));

  return beats;
}

/** Acts four, five and six, inside the cabin. */
function cabinBeats() {
  const beats = [];
  const player = { x: CEREMONY_CENTRE.x, z: CEREMONY_CENTRE.z, heading: CEREMONY_CENTRE.heading };
  const playerPoint = vec(CEREMONY_CENTRE.x, 0, CEREMONY_CENTRE.z);

  /* The last of the walk, where the cabin exists to be walked into. */
  beats.push(followBeat({ id: 'cabin-arrive', phase: 'cabin_arrive', path: TRAIL, t: 0.9 }));
  beats.push(followBeat({ id: 'cabin-door', phase: 'cabin_door', path: TRAIL, t: 1 }));

  /* The player has crossed the threshold while the Circle files in behind
   * him. This is still the live follow camera, only sampled at its first
   * stable cabin position so a newly added procession hold cannot disappear
   * from the framing gate. */
  const settleForward = vec(
    Math.sin(CABIN_DOOR.inside.heading),
    0,
    Math.cos(CABIN_DOOR.inside.heading),
  );
  const settlePlayer = vec(CABIN_DOOR.inside.x, 0, CABIN_DOOR.inside.z);
  const settleShot = INITIATION_SHOTS.follow({ player: settlePlayer, forward: settleForward });
  beats.push({
    id: 'cabin-settle',
    phase: 'cabin_settle',
    mode: 'follow',
    camera: settleShot,
    speaker: { id: 'player', point: standingHead(CABIN_DOOR.inside) },
    subject: { id: 'cabin-settle:ahead', point: settleShot.lookAt },
  });

  /* The only movement inside the ritual belongs to the player. This nominal
   * first-person frame publishes the start of that walk for the geometry
   * gate; live yaw remains under mouse control rather than under a shot rail. */
  beats.push({
    id: 'ceremony-approach',
    phase: 'ceremony_approach',
    mode: 'follow',
    camera: {
      position: vec(CABIN_DOOR.inside.x, PLAYER_EYE_Y, CABIN_DOOR.inside.z),
      lookAt: seatedTorso(LOU_SEAT, FIGURE_SCALE.founder),
    },
    speaker: { id: 'lou', point: seatedHead(LOU_SEAT, FIGURE_SCALE.founder) },
    subject: { id: 'lou-body', point: seatedTorso(LOU_SEAT, FIGURE_SCALE.founder) },
    aimToleranceM: 1.5,
  });

  /* ACT FOUR. Lou is in the chair at the head of the table from the moment the
   * player walks in and does not get out of it until IN-370, so the ceremony
   * beat's speaker is a SEATED head — lower, and slightly further back, than a
   * standing one. */
  beats.push({
    id: 'ceremony',
    phase: 'ceremony',
    mode: 'room',
    camera: INITIATION_SHOTS.room(),
    speaker: { id: 'lou', point: seatedHead(LOU_SEAT, FIGURE_SCALE.founder) },
    subject: { id: 'lou-body', point: seatedTorso(LOU_SEAT, FIGURE_SCALE.founder) },
    /* A WIDE, and it says so. `room()` deliberately looks at the middle of the
     * table with Lou at the head of it, which measures 1.061 m off his chest.
     * He is plainly in frame -- SPEAKER_OFF_CAMERA does not fire on any of
     * these three beats -- so this is a centring question, not a "he is off
     * screen" one, and the shot declares the width rather than the gate being
     * loosened for everybody. The default metre has to stay tight enough to
     * catch the ritual shot's 2.3 m. */
    aimToleranceM: 1.5,
  });

  /* The two men at his shoulders, who both speak during the ceremony. Same
   * shot, and the question they answer is whether the room's own blocking
   * still puts them in it — `site.js` measured those slots against the
   * furniture, and nothing has ever measured them against the LENS. */
  for (const [id, key] of [['ceremony-booski', 'BOOSKIBRO'], ['ceremony-rippin', 'RIPPINFLOW']]) {
    const slot = blockingSlot(CABIN_STANCES[key]);
    const scale = key === 'BOOSKIBRO' ? FIGURE_SCALE.booskibro : FIGURE_SCALE.member;
    beats.push({
      id,
      phase: 'ceremony',
      mode: 'room',
      camera: INITIATION_SHOTS.room(),
      speaker: { id: key.toLowerCase(), point: standingHead(slot, scale) },
      subject: { id: 'lou-body', point: seatedTorso(LOU_SEAT, FIGURE_SCALE.founder) },
      /* Same wide as `ceremony` above, and the same reason. */
      aimToleranceM: 1.5,
    });
  }

  /* THE QUESTION. He is on his feet for it — that is the beat: it works only
   * because it is the first time he has moved. `main.js` stands him half a
   * metre in front of the chair. */
  const louStanding = { x: LOU_SEAT.x, z: LOU_SEAT.z - 0.55 };
  for (const [id, phase] of [['oath-question', 'oath_question'], ['oath-yes', 'oath_yes']]) {
    beats.push({
      id,
      phase,
      mode: 'oath',
    camera: INITIATION_SHOTS.oath(),
      speaker: { id: 'lou', point: standingHead(louStanding, FIGURE_SCALE.founder) },
      subject: { id: 'lou-body', point: standingTorso(louStanding, FIGURE_SCALE.founder) },
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
   * ACT FIVE. The eight beats that played off screen.
   *
   * Every one of them is the same shot on the same thing: the player's left
   * hand, hanging at his side at the ceremony centre, which is where the card
   * is put and where the cut is made. `TABLE_SOCKETS.card.hand` is 'L' and
   * says so there because it is a property of the card.
   *
   * No speaker on any of them. Lou talks over most of the act and he is
   * deliberately out of frame while he does it — the act is about the hand,
   * and the camera is 0.6 m from it. Naming him here would report the scene's
   * best idea as a defect every run.
   * ═══════════════════════════════════════════════════════════════════ */
  const hand = handAt(player, 'L');
  for (const [id, phase] of [
    ['blade', 'blade'], ['hand', 'hand'], ['cut', 'cut'], ['card', 'card'],
    ['oath-1', 'oath_1'], ['oath-2', 'oath_2'], ['burn', 'burn'], ['made', 'made'],
  ]) {
    beats.push({
      id,
      phase,
      mode: 'ritual',
    camera: INITIATION_SHOTS.ritual({ hand }),
      subject: { id: 'player-hand', point: hand },
      /* The cut has landed by the time any of this plays — act five follows
       * the oath with no travel between them — so the smoothed look point is
       * fair to judge, and it is the shot's own. See docs/FRAMING-GATE.md on
       * why an unsettled beat may not be judged on `look`. */
      look: INITIATION_SHOTS.ritual({ hand }).lookAt,
      settled: true,
    });
  }

  /* THE PHYSICAL SHOT. The whiskey glass is handed into the player's right
   * hand, raised for the toast, and tipped for the drink. These phases reuse
   * the ritual camera but they emphatically do not reuse act five's left-hand
   * subject: publishing the right hand keeps the deterministic gate aligned
   * with `ritualHandWorld()` in the running scene. */
  const shotHand = handAt(player, 'R');
  for (const [id, phase] of [
    ['shot-offer', 'shot_offer'],
    ['shot-toast', 'shot_toast'],
    ['shot-drink', 'shot_drink'],
  ]) {
    const camera = INITIATION_SHOTS.ritual({ hand: shotHand });
    beats.push({
      id,
      phase,
      mode: 'ritual',
      camera,
      subject: { id: 'player-shot-hand', point: shotHand },
      look: camera.lookAt,
      settled: true,
    });
  }

  /* ACT SIX. The orbit, sampled at the four quarters: it is a continuous move
   * around a man standing in a room with a table, a stove and a chimney breast
   * in it, and the only way to know it never puts the lens inside the masonry
   * is to ask at more than one angle. Whoever is talking is somewhere in the
   * ring around him; the shot is on HIM, which is the point of the beat. */
  for (const [id, phase, angle] of [
    ['room-wide-0', 'room', 0],
    ['room-wide-quarter', 'room', Math.PI / 2],
    ['room-wide-half', 'room_aside', Math.PI],
    ['room-wide-three-quarter', 'room_aside', (3 * Math.PI) / 2],
  ]) {
    beats.push({
      id,
      phase,
      mode: 'room_wide',
    camera: INITIATION_SHOTS.room_wide({ angle, player: playerPoint }),
      subject: { id: 'player-body', point: standingTorso(CEREMONY_CENTRE) },
    });
  }

  /* THE PULLBACK. Out of the room, through the window, into the trees — and
   * the interesting end is the far one, where the camera is 26 m out and 7.5 m
   * up in a forest of 249 solids. Both ends published for the same reason as
   * the speech. */
  for (const [id, k] of [['pullback-start', 0], ['pullback-end', 1]]) {
    beats.push({
      id,
      phase: 'pullback',
      mode: 'pullback',
    camera: INITIATION_SHOTS.pullback({ k }),
      subject: { id: 'the-cabin', point: vec(CABIN.x, 1.6 + (k === 1 ? 0.9 : 0), CABIN.z) },
    });
  }

  return beats;
}

/**
 * The shot list for one built state of this scene.
 *
 * `state` is 'clearing' or 'cabin' — the two the geometry adapter builds,
 * because the site is two places 36 m of unlit trail apart and the scene is
 * never looking at both.
 */
export function initiationFramingBeats(state) {
  if (state === 'clearing') return clearingBeats();
  if (state === 'cabin') return cabinBeats();
  return [];
}

/** Every beat, for tests that want to count the scene rather than one half. */
export function allInitiationFramingBeats() {
  return [...clearingBeats(), ...cabinBeats()];
}
