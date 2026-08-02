/**
 * Shubenator's recurring campaign entrance.
 *
 * The words never change. The situation and performance do: an ordinary
 * first hello becomes increasingly inappropriate as Tony moves deeper into
 * Family business. Keep the three cues separate so production records three
 * genuinely different takes instead of copying one file under three names.
 */
export const SHUBENATOR_SIGNATURE_TEXT = 'Hey guys, what\u2019s going on?';

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
