import {
  INITIATION_PROCESSION_PHASES,
  INITIATION_PROCESSION_POLICY,
} from './trail-formation.js';

/**
 * INITIATION NIGHT — the state machine, as a table.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 *
 * The scene used to carry `phase` as a bare string advanced by `setPhase()`
 * and read by THREE hand-synchronised if/else chains — `updatePhase`,
 * `updateCamera` and the member-facing block. The cabin rewrite roughly
 * doubles the state count, and the specific trap is `updateCamera`'s chain,
 * which ended in a bare `else` meaning "complete": every new phase name
 * anybody forgot to add silently got the slow victory orbit. On the frame
 * Kittenboss is shot, that is a catastrophe nobody would find until playtest.
 *
 * So the phases are a frozen table with a `camera` field on every one of them,
 * `main.js` looks the mode up rather than falling through a chain, and
 * `tests/initiation-cabin-ceremony.test.mjs` asserts:
 *
 *   - every phase is REACHABLE from `approach`;
 *   - every non-terminal phase has at least one exit, so nothing dead-ends —
 *     the exact bug that stranded a player in the siege armoury, armed, with
 *     the objective frozen and nothing on screen telling him why;
 *   - every exit names a phase that exists;
 *   - every phase's camera mode is one `main.js` actually implements;
 *   - and every beat that shows a blank objective has a TIMEOUT, because a
 *     blank objective on a beat that can stall is the armoury bug verbatim.
 */

/**
 * How a phase leaves.
 *
 *   'player'  — the player's own movement or input advances it. Cannot stall:
 *               there is always something on screen telling him what to do.
 *   'timer'   — it runs for `timeout` seconds and then leaves.
 *   'event'   — a scripted thing finishes (a dialogue queue drains, an
 *               execution's onFinished fires). `timeout` is the watchdog, and
 *               it is not optional.
 *   'input'   — it waits for a choice, forever, on purpose. Only two phases
 *               are allowed this and both of them put a prompt on screen.
 */
export const ADVANCE_KINDS = Object.freeze(['player', 'timer', 'event', 'input']);

/**
 * Which side of the camera/control Seam owns the frame.
 *
 * `playable` and `look-only` are both first person through the shared Player;
 * only `cutscene` hands the camera to main.js's authored shot table.
 */
export const CONTROL_MODES = Object.freeze({
  PLAYABLE: 'playable',
  LOOK_ONLY: 'look-only',
  CUTSCENE: 'cutscene',
});

export const PLAYER_POSES = Object.freeze({
  STANDING: 'standing',
  KNEELING: 'kneeling',
});

/**
 * Every camera mode `main.js` implements.
 *
 * The test asserts each of these appears in `main.js`'s camera table, which is
 * what replaces the bare `else`.
 */
export const CAMERA_MODES = Object.freeze([
  'follow',      // behind the shoulder, while he is walking
  'line',        // the line-up, from off its west end
  'speech',      // wide on the clearing while Booskibro talks
  'stand_exec',  // side-on to Prospect One, standing, frontal
  'q2',          // frontal on the player for the founders question
  'clearing',    // the working ground, from behind the line
  'kneel_exec',  // over the line's shoulder at the mark being used
  'room',        // inside the cabin, on Lou at the head of the table
  'oath',        // close on Lou for the question
  'ritual',      // close on the hands
  'room_wide',   // the room, broken open
  'pullback',    // out of the window and into the trees
  'black',       // FAIL-B: nothing, because the screen is already black
  'hold',        // a fail card is up; the camera stops where it was
]);

const OBJ_LIGHTS = 'Follow the lights';
const KEYS_MOVE = 'WASD move · Shift run';
const OBJ_LINE = 'Take your place in the line';
const KEYS_LINE = 'Stand in the light';
const OBJ_TREES = 'Follow Booskibro into the trees';
const OBJ_INSIDE = 'Go inside';
const OBJ_STAND_BEFORE_LOU = 'Stand before Uncle Lou';
const OBJ_ANSWER = 'Answer';
const KEYS_THREE = '1 · 2 · 3';
const OBJ_ANSWER_LOU = 'Answer Lou';
const KEYS_TWO = '1 or 2';
const OBJ_HAND = 'Hold out your hands';
const OBJ_TAKE_SHOT = 'Take the shot';
const KEYS_PRESS = 'Space or Click';
const OBJ_PRESS = 'Press on';
const OBJ_REPEAT = 'Repeat the words';
const OBJ_HOLD = 'HOLD';

function phase(id, spec) {
  const exits = Object.freeze([...(spec.exits ?? [])]);
  const control = spec.control ?? (spec.canMove
    ? CONTROL_MODES.PLAYABLE
    : CONTROL_MODES.LOOK_ONLY);
  return Object.freeze({
    id,
    /** HUD string, or '' for the scene's watch-this convention. */
    objective: spec.objective ?? '',
    /* The keys that go with it, as their own field.
     *
     * These used to be `<span class="key">` markup inside the objective
     * string, which made the phase table carry its own presentation and made
     * the string unusable by anything that renders text -- including the
     * shared objective panel every other scene uses, which sets textContent
     * and would have printed the tags. Label and keys, separately, and the
     * panel puts the keys in its hint line. */
    keys: spec.keys ?? '',
    camera: spec.camera,
    advance: spec.advance,
    /** Seconds. `null` only where `advance` is 'player' or 'input'. */
    timeout: spec.timeout ?? null,
    canMove: spec.canMove === true,
    control,
    playerPose: spec.playerPose ?? PLAYER_POSES.STANDING,
    terminal: spec.terminal === true,
    /** True while the scene is showing a choice on `#quiz`. */
    choice: spec.choice === true,
    /**
     * True while a full-screen card with a button on it is up.
     *
     * The two fail phases show `#fail` with TRY AGAIN in the middle of it, so
     * a blank objective bar is not a player with nothing on screen telling him
     * what to do — it is a player looking at the only thing on screen.
     */
    card: spec.card === true,
    /** Per-phase policy consumed by the shared Player adapter. */
    moveScale: Number.isFinite(spec.moveScale) ? spec.moveScale : 1,
    allowSprint: spec.allowSprint !== false,
    dialogueTiming: spec.dialogueTiming ?? 'readable',
    beat: spec.beat ?? null,
    exits,
  });
}

export const PHASES = Object.freeze({
  /* ---- ACT ONE, as shipped ---- */
  approach: phase('approach', {
    objective: OBJ_LIGHTS, keys: KEYS_MOVE, camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-010', exits: ['line_up'],
  }),
  line_up: phase('line_up', {
    objective: OBJ_LINE, keys: KEYS_LINE, camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-020', exits: ['line_chat'],
  }),
  line_chat: phase('line_chat', {
    camera: 'line', advance: 'input', timeout: 6, choice: true,
    beat: 'IN-030', exits: ['line_chat_reply'],
  }),
  line_chat_reply: phase('line_chat_reply', {
    camera: 'line', advance: 'event', timeout: 14, exits: ['speech'],
  }),
  speech: phase('speech', {
    camera: 'speech', advance: 'event', timeout: 120, beat: 'IN-040', exits: ['q1'],
  }),
  q1: phase('q1', {
    camera: 'stand_exec', advance: 'event', timeout: 90, beat: 'IN-050', exits: ['q1_again'],
  }),
  q1_again: phase('q1_again', {
    camera: 'stand_exec', advance: 'event', timeout: 20, beat: 'IN-060', exits: ['exec_one'],
  }),
  exec_one: phase('exec_one', {
    camera: 'stand_exec', advance: 'event', timeout: 14, beat: 'IN-070', exits: ['after_one'],
  }),
  after_one: phase('after_one', {
    camera: 'line', advance: 'event', timeout: 14, beat: 'IN-075', exits: ['q2_intro'],
  }),
  q2_intro: phase('q2_intro', {
    camera: 'q2', advance: 'event', timeout: 60, beat: 'IN-080', exits: ['q2_choice'],
  }),
  q2_choice: phase('q2_choice', {
    objective: OBJ_ANSWER, keys: KEYS_THREE, camera: 'q2', advance: 'input', choice: true,
    beat: 'IN-085', exits: ['q2_result'],
  }),
  q2_result: phase('q2_result', {
    camera: 'q2', advance: 'event', timeout: 40, exits: ['q2_correct', 'exec_player'],
  }),
  q2_correct: phase('q2_correct', {
    camera: 'q2', advance: 'event', timeout: 40, beat: 'IN-090', exits: ['conspiracy_reveal'],
  }),

  /* ---- FAIL-A, entirely unchanged ---- */
  exec_player: phase('exec_player', {
    camera: 'q2', advance: 'event', timeout: 16, exits: ['failed'],
  }),
  failed: phase('failed', {
    camera: 'hold', advance: 'input', card: true, exits: ['q2_choice'],
  }),

  /* ---- ACT TWO: the nuclear option ---- */
  conspiracy_reveal: phase('conspiracy_reveal', {
    camera: 'clearing', advance: 'event', timeout: 45,
    beat: 'IN-100', exits: ['mass_kneel'],
  }),
  mass_kneel: phase('mass_kneel', {
    camera: 'clearing', advance: 'event', timeout: 30,
    playerPose: PLAYER_POSES.KNEELING,
    beat: 'IN-110', exits: ['execution_sweep'],
  }),
  execution_sweep: phase('execution_sweep', {
    camera: 'kneel_exec', advance: 'event', timeout: 30,
    playerPose: PLAYER_POSES.KNEELING,
    exits: ['execution_sweep', 'player_aim'],
  }),
  player_aim: phase('player_aim', {
    camera: 'clearing', advance: 'event', timeout: 30,
    playerPose: PLAYER_POSES.KNEELING,
    beat: 'IN-160', exits: ['lou_interrupt'],
  }),
  lou_interrupt: phase('lou_interrupt', {
    camera: 'clearing', advance: 'event', timeout: 30,
    playerPose: PLAYER_POSES.KNEELING,
    beat: 'IN-170', exits: ['walk_out'],
  }),

  /* ---- ACT THREE ---- */
  walk_out: phase('walk_out', {
    ...INITIATION_PROCESSION_POLICY,
    objective: OBJ_TREES, camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-200', exits: ['trail'],
  }),
  trail: phase('trail', {
    ...INITIATION_PROCESSION_POLICY,
    objective: OBJ_TREES, camera: 'follow', advance: 'player', canMove: true,
    exits: ['trail_choice', 'trail_reply', 'cabin_arrive'],
  }),
  trail_choice: phase('trail_choice', {
    ...INITIATION_PROCESSION_POLICY,
    objective: OBJ_TREES, camera: 'follow', advance: 'input', canMove: true,
    timeout: 9, choice: true, beat: 'IN-245', exits: ['trail_reply'],
  }),
  trail_reply: phase('trail_reply', {
    ...INITIATION_PROCESSION_POLICY,
    objective: OBJ_TREES, camera: 'follow', advance: 'event', canMove: true,
    timeout: 16, exits: ['trail', 'cabin_arrive'],
  }),
  cabin_arrive: phase('cabin_arrive', {
    ...INITIATION_PROCESSION_POLICY,
    objective: OBJ_TREES, camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-250', exits: ['cabin_door'],
  }),
  cabin_door: phase('cabin_door', {
    objective: OBJ_INSIDE, camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-260', exits: ['cabin_settle'],
  }),
  cabin_settle: phase('cabin_settle', {
    /* The moving group is the content. This timed event watchdog is not a
     * hidden delay: production leaves as soon as Lou, Rippin and Booski reach
     * their measured marks; timeout only guards a malformed route. */
    camera: 'follow', advance: 'event', timeout: 18,
    exits: ['ceremony'],
  }),

  /* ---- ACT FOUR ---- */
  ceremony: phase('ceremony', {
    camera: 'room', advance: 'event', timeout: 180, beat: 'IN-300',
    exits: ['ceremony_approach', 'oath_question'],
  }),
  ceremony_approach: phase('ceremony_approach', {
    objective: OBJ_STAND_BEFORE_LOU, keys: KEYS_MOVE,
    camera: 'follow', advance: 'player', canMove: true,
    beat: 'IN-310', exits: ['ceremony'],
  }),
  /* The one beat in the game where the pause before the input is the content.
   * No timeout, deliberately — Lou will wait, and the room will wait. It is
   * legal because the prompt is on screen: this is not a blank objective. */
  oath_question: phase('oath_question', {
    objective: OBJ_ANSWER_LOU, keys: KEYS_TWO, camera: 'oath', advance: 'input', choice: true,
    beat: 'IN-370', exits: ['oath_yes', 'oath_no'],
  }),
  oath_yes: phase('oath_yes', {
    camera: 'oath', advance: 'event', timeout: 30, beat: 'IN-371', exits: ['blade'],
  }),
  /* SILENCE, HELD LONGER THAN A GAME NORMALLY HOLDS ANYTHING. "No. I don't."
   * runs about three seconds; the rest of this is nobody moving, one boot on
   * one board, the tiniest nod, and then the shot. */
  oath_no: phase('oath_no', {
    camera: 'black', advance: 'timer', timeout: 6.5, beat: 'FAIL-B', exits: ['failed_oath'],
  }),
  /* FAIL-B's retry resumes on Lou standing with the question re-asked, and
   * NOTHING BEFORE IT REPLAYS — not the code, not the deeds, not the aside. */
  failed_oath: phase('failed_oath', {
    camera: 'black', advance: 'input', card: true, exits: ['oath_question'],
  }),

  /* ---- ACT FIVE. Three inputs, and none of them can fail. ---- */
  blade: phase('blade', {
    camera: 'ritual', advance: 'timer', timeout: 3.0, beat: 'IN-400', exits: ['hand'],
  }),
  /* The timeouts in this act count from the START of the beat, and Lou has to
   * finish speaking first — so they are the owner's four seconds PLUS the line
   * that precedes them. Refusing the hand cannot fail it: Lou takes it. */
  hand: phase('hand', {
    objective: OBJ_HAND, keys: KEYS_PRESS, camera: 'ritual', advance: 'event', timeout: 10, beat: 'IN-410', exits: ['cut'],
  }),
  cut: phase('cut', {
    objective: OBJ_PRESS, keys: KEYS_PRESS, camera: 'ritual', advance: 'event', timeout: 6, beat: 'IN-415', exits: ['card'],
  }),
  card: phase('card', {
    camera: 'ritual', advance: 'timer', timeout: 2.6, beat: 'IN-420', exits: ['oath_1'],
  }),
  /* THE OATH IS A CHOICE NOW, and the wrong one is an ending.
   *
   * These used to be a single press with a comment saying nothing in this act
   * could fail. Lou says a line, the room stops, and three go up: his words
   * exactly, and two men who heard the sense and not the words. `choice: true`
   * is the same flag the founders question carries, and `failed_oath` is the
   * same exit the refusal at IN-370 takes -- one round off the shoulder.
   *
   * The keys are 1/2/3 now rather than Space, so the objective says so. */
  oath_1: phase('oath_1', {
    objective: OBJ_REPEAT, keys: KEYS_THREE, camera: 'ritual', advance: 'input',
    choice: true, timeout: 22, beat: 'IN-430', exits: ['oath_2', 'failed_oath'],
  }),
  oath_2: phase('oath_2', {
    objective: OBJ_REPEAT, keys: KEYS_THREE, camera: 'ritual', advance: 'input',
    choice: true, timeout: 20, beat: 'IN-435', exits: ['burn', 'failed_oath'],
  }),
  /* Lou's hand closing over the player's IS the fallback. A player who cannot
   * or will not hold the button is held. */
  burn: phase('burn', {
    objective: OBJ_HOLD, keys: KEYS_PRESS, camera: 'ritual', advance: 'event', timeout: 8, beat: 'IN-440', exits: ['made'],
  }),
  made: phase('made', {
    camera: 'ritual', advance: 'event', timeout: 40, beat: 'IN-450', exits: ['room'],
  }),

  /* ---- ACT SIX ---- */
  room: phase('room', {
    /* The delivered-VO room-reaction schedule owns this beat. It erupts for
     * roughly fifteen seconds; twenty-four is only the missing-callback drain. */
    camera: 'room_wide', advance: 'event', timeout: 24, beat: 'IN-500', exits: ['room_aside'],
  }),
  room_aside: phase('room_aside', {
    camera: 'room_wide', advance: 'event', timeout: 40, beat: 'IN-520', exits: ['shot_offer'],
  }),
  shot_offer: phase('shot_offer', {
    objective: OBJ_TAKE_SHOT, keys: KEYS_PRESS,
    camera: 'ritual', advance: 'event', timeout: 10, exits: ['shot_toast'],
  }),
  shot_toast: phase('shot_toast', {
    camera: 'ritual', advance: 'event', timeout: 5, exits: ['shot_drink'],
  }),
  shot_drink: phase('shot_drink', {
    camera: 'ritual', advance: 'timer', timeout: 1.8, exits: ['pullback'],
  }),
  pullback: phase('pullback', {
    camera: 'pullback', advance: 'timer', timeout: 14, beat: 'IN-540', exits: ['complete'],
  }),
  complete: phase('complete', {
    camera: 'pullback', advance: 'player', terminal: true, exits: [],
  }),
});

export const PHASE_IDS = Object.freeze(Object.keys(PHASES));

export const START_PHASE = 'approach';

/* Guard the phase table against policy drift. An added/renamed procession
 * phase must be configured here rather than quietly regaining sprint. */
for (const id of INITIATION_PROCESSION_PHASES) {
  if (!PHASES[id]) throw new Error(`Initiation procession phase "${id}" is missing`);
}

export function phaseById(id) {
  return PHASES[id] ?? null;
}

/** Every phase you can get to from `approach` by following exits. */
export function reachablePhases(from = START_PHASE) {
  const seen = new Set();
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !PHASES[id]) continue;
    seen.add(id);
    queue.push(...PHASES[id].exits);
  }
  return seen;
}

/**
 * Phases that can be entered and not left.
 *
 * A phase dead-ends if it is not terminal and has no exits, or if every exit
 * it has names a phase that does not exist. Both are the armoury bug.
 */
export function deadEndPhases() {
  return PHASE_IDS.filter((id) => {
    const spec = PHASES[id];
    if (spec.terminal) return false;
    return spec.exits.filter((exit) => PHASES[exit]).length === 0;
  });
}

/**
 * Phases that show nothing on the HUD and have no way of timing out.
 *
 * The scene's watch-this convention is a blank objective bar, and it is only
 * safe while something else is moving. `advance: 'player'` is exempt because
 * the player's own movement is the thing that is moving, and `'input'` is
 * exempt only when the phase puts a prompt up.
 */
export function stallablePhases() {
  return PHASE_IDS.filter((id) => {
    const spec = PHASES[id];
    if (spec.terminal || spec.advance === 'player' || spec.card) return false;
    if (spec.timeout !== null) return false;
    return spec.objective === '';
  });
}

/** The nuclear-option execution phases in their authored order. */
export function executionCycle(count) {
  return ['mass_kneel', ...Array(count).fill('execution_sweep'), 'player_aim', 'lou_interrupt'];
}
