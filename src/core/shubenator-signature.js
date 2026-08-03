/**
 * Shubenator's recurring campaign entrance.
 *
 * The words never change. The situation and performance do: an ordinary
 * first hello becomes increasingly inappropriate as Tony moves deeper into
 * Family business. Keep the three cues separate so production records three
 * genuinely different takes instead of copying one file under three names.
 *
 * The line is funny once a scene and tiresome twice. Anything that can fire it
 * on proximity, on a walk-up, or on a crowd bark has to go through the gate at
 * the bottom of this file, which enforces two things: a cooldown long enough
 * that he cannot greet the same room twice in a row, and a rotation so that
 * when he does say it again it is a different take. The three authored story
 * moments are exempt from the cooldown — they are the joke, not the noise —
 * but they arm it, so an ambient hello can never tread on one.
 */
export const SHUBENATOR_SIGNATURE_TEXT = 'Hey guys, what’s going on?';

function take(cue, direction) {
  return Object.freeze({ cue, text: SHUBENATOR_SIGNATURE_TEXT, direction });
}

export const SHUBENATOR_SIGNATURE_TAKES = Object.freeze({
  firstMeeting: take(
    'vo.bing.hang.shubenator.signature.cheerful',
    'Cheerful and casually late to the conversation. A friendly first hello; he genuinely believes nothing in the room is tense.',
  ),
  hotDogAftermath: take(
    'vo.bing2.shubenator.signature.gleeful',
    'Gleeful and brightly oblivious, immediately after the violence. Do not acknowledge the body or play the darkness of the room.',
  ),
  heistCleanup: take(
    'heist.shubes_signature_cleanup',
    'Pleasant, deadpan, and entirely untroubled during mission cleanup. He sounds as though he has just joined an ordinary group chat.',
  ),
});

/**
 * Three and a half minutes. Long enough that he cannot greet a room twice on
 * one visit, short enough that a player crossing the whole club and coming
 * back is allowed to hear it again.
 */
export const SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS = 210;

/** The order ambient hellos cycle through, so a repeat is never a re-run. */
export const SHUBENATOR_SIGNATURE_ROTATION = Object.freeze([
  'firstMeeting', 'heistCleanup', 'hotDogAftermath',
]);

/**
 * A gate around the signature line.
 *
 * @param {object} [options]
 * @param {number} [options.cooldownSeconds]
 * @param {() => number} [options.now] seconds; injected so tests own the clock
 * @param {string[]} [options.rotation] take keys, in the order they recur
 */
export function createShubenatorSignature({
  cooldownSeconds = SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS,
  now = () => Date.now() / 1000,
  rotation = SHUBENATOR_SIGNATURE_ROTATION,
} = {}) {
  const order = rotation.filter((key) => SHUBENATOR_SIGNATURE_TAKES[key]);
  if (!order.length) throw new TypeError('Shubenator rotation names no known take');

  let lastAt = -Infinity;
  let lastKey = null;
  let cursor = 0;

  /** Seconds until he is allowed to say it unprompted again; 0 when ready. */
  function cooldownRemaining(at = now()) {
    return Math.max(0, cooldownSeconds - (at - lastAt));
  }

  function arm(key, at) {
    lastAt = at;
    lastKey = key;
  }

  return {
    get lastKey() { return lastKey; },
    get lastAt() { return lastAt; },
    cooldownRemaining,
    ready(at = now()) { return cooldownRemaining(at) <= 0; },

    /**
     * An unprompted hello. Returns the take to play, or `null` when he said it
     * too recently — callers must treat null as "he stays quiet", not as a
     * reason to substitute some other line.
     */
    offer(at = now()) {
      if (cooldownRemaining(at) > 0) return null;
      /* Step past the take he used last, so consecutive hellos are different
       * performances even when the cooldown is the only thing between them. */
      let key = order[cursor % order.length];
      if (key === lastKey && order.length > 1) {
        cursor += 1;
        key = order[cursor % order.length];
      }
      cursor += 1;
      arm(key, at);
      return SHUBENATOR_SIGNATURE_TAKES[key];
    },

    /**
     * One of the three authored story moments. Always returns its take — the
     * scripted beats are the joke and must not be swallowed by a cooldown —
     * but arms the gate so an ambient hello cannot follow it immediately.
     */
    scripted(key, at = now()) {
      const chosen = SHUBENATOR_SIGNATURE_TAKES[key];
      if (!chosen) throw new TypeError(`Unknown Shubenator take: ${key}`);
      arm(key, at);
      return chosen;
    },

    /** Fresh scene, fresh gate. */
    reset() {
      lastAt = -Infinity;
      lastKey = null;
      cursor = 0;
    },
  };
}
