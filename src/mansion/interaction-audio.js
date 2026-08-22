/**
 * Mansion furniture foley.
 *
 * The composition root supplies its scene-local AudioEngine. Keeping these
 * tiny event adapters outside main.js makes the six late-scene placements
 * observable without constructing a renderer or borrowing a global engine.
 */
/* ================================================================== */
/* THE BILLIARD TABLE'S OWN FIVE SOUNDS                                 */
/*                                                                       */
/* NOTHING IN THE MANIFEST FITTED. The nearest existing recordings are    */
/* `golf.hit.putt` (a putter face on a golf ball, on grass) and           */
/* `dish.clink`, and a resin ball striking another resin ball is neither  */
/* -- it is the single most recognisable noise in the game and a wrong    */
/* one is worse than none. So these are minted properly: authored here    */
/* with a prompt each, put in assets/sfx/manifest.json by                 */
/* `npm run sfx:pool`, held there by `npm run check:pool-sfx` (which      */
/* `npm run check` runs), and rendered whenever `npm run sfx` next runs.  */
/*                                                                        */
/* AND THE HOUSE ACTUALLY DECODES THEM. `POOL_CUE_NAMES` is spread into   */
/* MANSION_INTERACTION_CUE_NAMES above, which src/mansion/audio-banks.js  */
/* puts in the START bank -- the one the start button waits for. That is  */
/* not a detail: a recording that exists, is indexed, and sits outside    */
/* the one filter deciding what a page decodes plays as a synth stand-in  */
/* while every gate stays green, and that exact bug has been found in     */
/* this repo three times in a week (the suite's four takes, the sixty-    */
/* seven radio takes, `enola.blast.*`). tests/mansion-pool.test.mjs       */
/* asserts the residency rather than trusting this comment.               */
/* ================================================================== */

/** `[name, prompt, seconds]`, the shape tools/mansion-sfx.mjs established. */
export const POOL_SFX_CUES = Object.freeze([
  Object.freeze([
    'billiards.cue.strike',
    'a leather cue tip striking a phenolic resin ball at moderate speed on a slate billiard table, '
    + 'a short dry chalky knock with a woody body behind it and no ring, close mic, no room reverb, '
    + 'no voice, no music',
    0.5,
  ]),
  Object.freeze([
    'billiards.break',
    'a hard break shot on a slate pool table, one heavy cue strike immediately followed by fifteen '
    + 'resin balls scattering, a dense burst of hard clicks spreading out over a second and a half '
    + 'with balls running over cloth and into cushions, close interior, no voice, no music',
    2.4,
  ]),
  Object.freeze([
    'billiards.click',
    'one resin billiard ball striking another squarely, a bright hard high-pitched click with a '
    + 'very short tail, recorded close over a slate bed, no room, no voice, no music',
    0.4,
  ]),
  Object.freeze([
    'billiards.rail',
    'a billiard ball hitting a rubber cushion on a slate table, a dull woody thump with almost no '
    + 'click in it and a faint rubber squeak as the ball comes off, close interior, no voice, no music',
    0.45,
  ]),
  /* THE ONE CUE THE NEW STROKE ACTUALLY NEEDED.
   *
   * The golf meter (src/golf/swing.js, via ../mansion/pool.js) created a class
   * of shot the table had no sound for: a stroke stopped well outside the dead
   * zone is the tip skidding off the side of the ball, and that is not a
   * quieter `billiards.cue.strike`, it is a different noise -- no chalk bite,
   * a squeak, and a ball that leaves wrong. Without it a duffed shot sounds
   * identical to a pured one, which throws away the feedback the whole meter
   * exists to give.
   *
   * CONSIDERED AND NOT MINTED: a chalk scuff and a rack. Nothing in the frame
   * chalks -- there is no action, no hook and nowhere to play it from -- and
   * `PoolFrame.rack()` fires no event either. A cue in the manifest that
   * nothing ever calls is the exact failure this file's header is about, only
   * from the other end: it would be recorded, paid for, and silent. */
  Object.freeze([
    'billiards.miscue',
    'a miscue on a pool table, the leather tip skidding off the side of the cue ball, a scratchy '
    + 'muffled scuff with a faint squeak and a dull off-centre knock instead of a clean click, '
    + 'close mic on slate, no room reverb, no voice, no music',
    0.55,
  ]),
  Object.freeze([
    'billiards.pocket',
    'a billiard ball dropping into a pocket, a ball leaving the cloth and falling into a net and '
    + 'wooden channel, one soft leathery thud then a short low wooden roll away underneath the table, '
    + 'close interior, no voice, no music',
    1.3,
  ]),
]);

export const POOL_CUE_NAMES = Object.freeze(POOL_SFX_CUES.map(([name]) => name));

/**
 * The cue ball is struck. `power` is the shot's own 0..1, so the break and a
 * safety tap are not the same noise at the same level -- the table is the
 * loudest object in the lounge and a flat volume makes every shot read as a
 * break, which is how a room stops having dynamics.
 */
export function playCueStrike(audio, position = null, power = 0.6, accuracy = 0) {
  /* Past this the meter was stopped a long way outside its dead zone and the
   * tip did not take the ball cleanly. 0.55 rather than golf's 0.42
   * slice/hook line because a pool stroke is the easiest swing in the game to
   * keep straight -- a fade is still a hit, and only a real duff should sound
   * like one. */
  if (Math.abs(accuracy) > 0.55) {
    return audio?.play?.('billiards.miscue', {
      volume: 0.36 + power * 0.24,
      rate: 0.97 + power * 0.06,
      ...at(position),
    }) ?? null;
  }
  return audio?.play?.(power >= 0.86 ? 'billiards.break' : 'billiards.cue.strike', {
    volume: 0.34 + power * 0.4,
    rate: 0.96 + power * 0.08,
    ...at(position),
  }) ?? null;
}

/** Ball on ball. `speed` is the closing speed along the line of centres. */
export function playBallClick(audio, position = null, speed = 1) {
  /* Under this the contact is a nudge in the pack and playing it is a machine
   * gun: one break shot generates dozens of contacts inside a second. */
  if (speed < 0.28) return null;
  return audio?.play?.('billiards.click', {
    volume: Math.min(0.62, 0.14 + speed * 0.14),
    rate: 0.94 + Math.min(0.5, speed * 0.08),
    ...at(position),
  }) ?? null;
}

export function playCushion(audio, position = null, speed = 1) {
  if (speed < 0.35) return null;
  return audio?.play?.('billiards.rail', {
    volume: Math.min(0.5, 0.12 + speed * 0.1),
    ...at(position),
  }) ?? null;
}

export function playPocket(audio, position = null) {
  return audio?.play?.('billiards.pocket', { volume: 0.6, ...at(position) }) ?? null;
}

export const MANSION_INTERACTION_CUE_NAMES = Object.freeze([
  'chair.sit',
  'chair.scrape.wood',
  'bed.rustle',
  'bed.creak',
  ...POOL_CUE_NAMES,
]);

/** Keep the page alive long enough for both scheduled bed beats to speak. */
export const GUEST_SLEEP_AUDIO_SECONDS = 0.46;

function at(position) {
  return position ? { position } : {};
}

export function playTheatreSit(audio, position = null) {
  return audio?.play?.('chair.sit', {
    volume: 0.58,
    delay: 0.12,
    ...at(position),
  }) ?? null;
}

export function playTheatreStand(audio, position = null) {
  return audio?.play?.('chair.scrape.wood', {
    volume: 0.54,
    rate: 0.96,
    ...at(position),
  }) ?? null;
}

export function playGuestBedSleep(audio, position = null) {
  audio?.play?.('bed.rustle', {
    volume: 0.62,
    ...at(position),
  });
  audio?.play?.('bed.creak', {
    volume: 0.68,
    delay: 0.18,
    ...at(position),
  });
  return GUEST_SLEEP_AUDIO_SECONDS;
}
