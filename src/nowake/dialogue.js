/**
 * NO WAKE's spoken script, after the redesign.
 *
 * This is shared by the scene and `tools/nowake-vo.mjs`, so a line cannot be
 * playable in the mission without also appearing in the recording manifest.
 * Cue names omit the common `vo.nowake.` prefix and final take number.
 *
 * The rules this script is written to, all of them the owner's:
 *
 *   "No Wake should feel like a pressure cooker with navigation lights.
 *    Everyone knows what the trip is really for except Willy, and even Willy
 *    senses something is wrong. The humor comes only from the absurdly
 *    specific Counter-Strike lie that finally exposes him. Nobody delivers
 *    punchlines, nobody flails around."
 *
 * So: nothing in here is a joke, nobody makes a speech, and there is no
 * confession. The proof is a recording of Willy's earlier operational leak;
 * the Negev question is the line that tells Booski the old friendship was
 * built on the same kind of lie. It lands because everything before it has
 * been flat.
 *
 * The one thing that reads as absurd — a man's life turning on whether there
 * was ever a Negev on B — is absurd to the player, not to anybody on the boat,
 * which is the whole of `docs/TONE-AND-PARODY.md` in one line of dialogue.
 */
function line(cue, who, voice, text, extra = {}) {
  return Object.freeze({ cue, who, voice, text, ...extra });
}

/**
 * The dock, at dusk. Willy arrives with the player. Nobody greets him warmly,
 * and his opener gets no answer at all — the silence after it is the first
 * thing in the mission that is wrong.
 */
export const NO_WAKE_DOCK_LINES = Object.freeze([
  line('dock.willy.nice-night', 'Willy', 'willy', 'Nice night for it.', { focus: 'willy', seconds: 2.6 }),
  line('dock.lou.get-her-started', 'Big Uncle Lou', 'lou', 'Get her started.', { focus: 'lou', seconds: 2.4 }),
]);

/**
 * Out through the no-wake channel.
 *
 * Four lines across ninety seconds, and two of them are one word. The score
 * thins to engines and hull; this is what is left of the conversation.
 */
const CRUISE = Object.freeze({
  quiet: line('cruise.willy.quiet', 'Willy', 'willy', 'Quiet tonight.', { at: 16, seconds: 2.4 }),
  yeah: line('cruise.booski.yeah', 'Booskibro', 'booski', 'Yeah.', { at: 21, seconds: 1.8 }),
  /* One campaign-derived line, so the week the player actually had reaches the
   * boat. Willy is not oblivious — the spec is explicit that he senses it from
   * the dock onward — and this is him testing the water and getting nothing. */
  strip: line(
    'cruise.willy.strip', 'Willy', 'willy',
    'Nobody has said one word to me about the strip. Not one.',
    { at: 42, seconds: 3.6 },
  ),
  /* `cruise.willy.sideways`, NOT `cruise.willy.motel`.
   *
   * The old scene shipped a recorded `vo.nowake.cruise.willy.motel.1.mp3`
   * carrying different words ("Nice to get out. Everybody has been looking at
   * me funny since the Motel."). Reusing the cue name would have that take play
   * under this subtitle for anybody whose Motel went loud — a delivered
   * recording of a line nobody writes any more. A reworded line gets a new cue. */
  motel: line(
    'cruise.willy.sideways', 'Willy', 'willy',
    'Everybody has been looking at me sideways since the Motel.',
    { at: 42, seconds: 3.6 },
  ),
  clean: line(
    'cruise.willy.clean', 'Willy', 'willy',
    'Feels like nobody has been talking to me this week.',
    { at: 42, seconds: 3.4 },
  ),
  where: line('cruise.willy.where', 'Willy', 'willy', 'Where exactly are we headed?', { at: 68, seconds: 2.8 }),
  away: line('cruise.lou.away', 'Big Uncle Lou', 'lou', 'Away from the dock.', { at: 72, seconds: 2.4 }),
});

/**
 * The ride out, given the campaign the player actually played.
 *
 * Exactly one of the three middle variants is always present, so the ride is
 * the same shape either way and the manifest carries all three.
 */
export function buildNoWakeCruise({ beefDetected = false, motelPoliceHeat = 0 } = {}) {
  const middle = beefDetected ? CRUISE.strip : motelPoliceHeat > 55 ? CRUISE.motel : CRUISE.clean;
  return [CRUISE.quiet, CRUISE.yeah, middle, CRUISE.where, CRUISE.away];
}

/**
 * The inlet, behind the wooded point.
 *
 * "The silence after the engines stop should be uncomfortable." Lou's two
 * orders are four words between them, and the second one is about the engines.
 */
export const NO_WAKE_INLET_LINES = Object.freeze({
  bringHerDown: line('inlet.lou.bring-her-down', 'Big Uncle Lou', 'lou', 'Bring her down.', { focus: 'lou', seconds: 2.2 }),
  killThem: line('inlet.lou.kill-them', 'Big Uncle Lou', 'lou', 'Kill them.', { focus: 'lou', seconds: 2.0 }),
  channelClear: line('inlet.irish.channel-clear', 'Irish', 'irish', 'Channel’s clear.', { focus: 'irish', seconds: 2.2 }),
  outOfTheWind: line('inlet.lou.out-of-the-wind', 'Big Uncle Lou', 'lou', 'Let’s get out of the wind.', { focus: 'lou', seconds: 2.8 }),
});

/**
 * The cabin.
 *
 * Booski pours one shot and slides it across. Willy talks because nobody else
 * will, and what he chooses to talk about is the round he won five years ago.
 *
 * `beat` marks the two places the scene does something other than speak: the
 * shot goes down after `mirage`, and Lou's pause before the Negev question is
 * long enough that the player wonders whether the scene has stalled. Both are
 * staged by the runtime; the pause is authored here so it cannot be tuned out
 * by accident.
 */
export const NO_WAKE_CABIN_SCRIPT = Object.freeze([
  line(
    'cabin.willy.mirage', 'Willy', 'willy',
    'You remember that Mirage match? We were down fourteen-twelve. Everybody was broke. I bought the Negev, went B, and held the whole site by myself.',
    { focus: 'willy', seconds: 8.4, beat: 'nothing' },
  ),
  line(
    'cabin.willy.three-through-apartments', 'Willy', 'willy',
    'Three through apartments. One coming out market. Saved the whole damn round.',
    { focus: 'willy', seconds: 5.0, beat: 'shot' },
  ),
  line('cabin.lou.willy', 'Big Uncle Lou', 'lou', 'Willy.', { focus: 'lou', seconds: 2.0 }),
  line('cabin.willy.yeah', 'Willy', 'willy', 'Yeah?', { focus: 'willy', seconds: 1.8 }),
  line(
    'cabin.lou.recorded-leak', 'Big Uncle Lou', 'lou',
    'Irish pulled their wire. Your voice gave them the mountain strip from the Beef Run and our arrival time.',
    { focus: 'lou', seconds: 5.2 },
  ),
  line(
    'cabin.willy.not-my-voice', 'Willy', 'willy',
    'You don’t know who was on that tape.',
    { focus: 'willy', seconds: 3.0 },
  ),
  /* The blade entering the scene. Lou waits first — `beat: 'stall'` holds the
   * room long enough to be uncomfortable — and then asks it flatly, like a man
   * checking a delivery note. */
  line(
    'cabin.lou.negev', 'Big Uncle Lou', 'lou',
    'Was there ever even a Negev on B?',
    { focus: 'lou', seconds: 3.4, beat: 'stall' },
  ),
  line('cabin.willy.lou', 'Willy', 'willy', 'Lou…', { focus: 'willy', seconds: 2.2, beat: 'settle' }),
  line('cabin.lou.answer', 'Big Uncle Lou', 'lou', 'Answer the question.', { focus: 'lou', seconds: 2.6 }),
  line(
    'cabin.willy.dont-remember', 'Willy', 'willy',
    'I don’t remember every gun from every round.',
    { focus: 'willy', seconds: 3.4 },
  ),
  line(
    'cabin.booski.brother', 'Booskibro', 'booski',
    'You were like a brother to me.',
    { focus: 'booski', seconds: 3.0 },
  ),
  line('cabin.willy.boosk', 'Willy', 'willy', 'Boosk, come on. You know me.', { focus: 'willy', seconds: 3.0 }),
  line('cabin.lou.we-do-now', 'Big Uncle Lou', 'lou', 'Yeah. We do now.', { focus: 'lou', seconds: 2.8 }),
  /* He looks at the stairs. The Prospect is in them. He sets the glass down. */
  line('cabin.willy.take-a-seat', 'Willy', 'willy', 'Can I take a seat?', { focus: 'willy', seconds: 2.6, beat: 'stairs' }),
  line('cabin.booski.sit-down', 'Booskibro', 'booski', 'Sit down.', { focus: 'booski', seconds: 2.0, beat: 'sit' }),
  /* No confession. No begging. He looks once at the ceiling, knowing Irish is
   * up there, then back at Lou. Two words. */
  line('cabin.willy.all-right', 'Willy', 'willy', 'All right.', { focus: 'willy', seconds: 2.8, beat: 'ceiling' }),
]);

/** Everything spoken after the shot. Keyed, because the runtime queues them. */
export const NO_WAKE_BODY_LINES = Object.freeze({
  finishIt: line('body.lou.finish-it', 'Big Uncle Lou', 'lou', 'Finish it.', { seconds: 2.2 }),
  yourSide: line(
    'body.booski.your-side', 'Booskibro', 'booski',
    'Your side. Fold it over and hold it down.',
    { seconds: 3.2 },
  ),
  straps: line(
    'body.booski.straps', 'Booskibro', 'booski',
    'Straps now. Pull them tight and I’ll close him up.',
    { seconds: 3.6 },
  ),
  needsWeight: line('body.lou.needs-weight', 'Big Uncle Lou', 'lou', 'Needs weight.', { seconds: 2.2 }),
  bowLocker: line('body.booski.bow-locker', 'Booskibro', 'booski', 'Bow locker.', { seconds: 1.9 }),
  /* Irish does not turn round and does not ask. He heard it. */
  nothingBehindUs: line('body.irish.nothing-behind-us', 'Irish', 'irish', 'Nothing behind us.', { seconds: 2.4 }),
  sockets: line(
    'body.booski.sockets', 'Booskibro', 'booski',
    'Clip it to the rings. I’ll cinch it down.',
    { seconds: 3.2 },
  ),
  moveHim: line('body.lou.move-him', 'Big Uncle Lou', 'lou', 'Move him.', { seconds: 2.0 }),
  stillClear: line('body.irish.still-clear', 'Irish', 'irish', 'Still clear.', { seconds: 2.0 }),
  startHer: line('body.lou.start-her', 'Big Uncle Lou', 'lou', 'Start her.', { seconds: 2.0 }),
});

/** Every possible spoken line, including all three campaign-dependent variants. */
export function allNoWakeVoiceLines() {
  return [
    ...NO_WAKE_DOCK_LINES,
    ...Object.values(CRUISE),
    ...Object.values(NO_WAKE_INLET_LINES),
    ...NO_WAKE_CABIN_SCRIPT,
    ...Object.values(NO_WAKE_BODY_LINES),
  ];
}
