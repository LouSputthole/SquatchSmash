/**
 * NO WAKE's spoken script.
 *
 * This is shared by the scene and `tools/nowake-vo.mjs`, so a line cannot be
 * playable in the mission without also appearing in the recording manifest.
 * Cue names omit the common `vo.nowake.` prefix and final take number.
 */
function line(cue, who, voice, text, extra = {}) {
  return Object.freeze({ cue, who, voice, text, ...extra });
}

export const NO_WAKE_AMBIENT_LINES = Object.freeze([
  line(
    'cruise.willy.cigars', 'Willy', 'willy',
    'This old girl still smells like Lou’s cigars. He sold the ashtrays but kept the smell.',
    { at: 12 },
  ),
  line(
    'cruise.booski.markers', 'Booskibro', 'booski',
    'Red markers to starboard, Tony. Unless you want the Harbor Patrol in the conversation.',
    { at: 31 },
  ),
  line(
    'cruise.willy.motel', 'Willy', 'willy',
    'Nice to get out. Everybody has been looking at me funny since the Motel.',
    { at: 53 },
  ),
  line(
    'cruise.lou.water', 'Big Uncle Lou', 'lou',
    'Nobody is looking at anybody, Willy. Enjoy the water.',
    { at: 72 },
  ),
  /* Irish spends the ride out doing the only thing he does at the club, and
   * it is the last ordinary thing that happens on this boat. The back half of
   * the egg story is deliberately never told. */
  line(
    'cruise.irish.egg', 'Irish', 'irish',
    'I’ll do the back half of the egg story on the way in. There is a back half. Nobody ever gets to it.',
    { at: 90 },
  ),
]);

export const NO_WAKE_START_LINES = Object.freeze([
  line(
    'start.lou.platform', 'Big Uncle Lou', 'lou',
    'Prospect. The platform is down. Walk it onto the port deck and do not make me come back for you.',
  ),
  line(
    'start.booski.sequence', 'Booskibro', 'booski',
    'Battery, blower, ignition. Then both lines. The helm is through the open port side.',
  ),
]);

const REVEAL = Object.freeze({
  quiet: line(
    'reveal.lou.quiet', 'Big Uncle Lou', 'lou',
    'Kill the engines in your head for a minute, kid. We need the quiet.',
    { focus: 'lou' },
  ),
  sandwiches: line(
    'reveal.willy.sandwiches', 'Willy', 'willy',
    'What is this, Lou? You said a ride. I brought sandwiches.',
    { focus: 'willy' },
  ),
  beefDetected: line(
    'reveal.lou.beef-detected', 'Big Uncle Lou', 'lou',
    'The Beef Run drew eyes because somebody gave them a tail number and a day.',
    { focus: 'lou' },
  ),
  beefClean: line(
    'reveal.lou.beef-clean', 'Big Uncle Lou', 'lou',
    'The Beef Run was clean. Then a Bureau report named the strip, the cargo, and all four crates.',
    { focus: 'lou' },
  ),
  pickup: line(
    'reveal.booski.pickup', 'Booskibro', 'booski',
    'Four people knew the reserve pickup. Lou, me, Tony, and the man who asked twice which room.',
    { focus: 'booski' },
  ),
  questions: line(
    'reveal.willy.questions', 'Willy', 'willy',
    'I ask things. I am interested. That is a crime now?',
    { focus: 'willy' },
  ),
  motelHot: line(
    'reveal.lou.motel-hot', 'Big Uncle Lou', 'lou',
    'The Bureau was on the Motel road before the first siren. That did not happen by luck.',
    { focus: 'lou' },
  ),
  motelClean: line(
    'reveal.lou.motel-clean', 'Big Uncle Lou', 'lou',
    'The Bureau knew the Motel, the room, and what was in the cases before Cecilio opened the door.',
    { focus: 'lou' },
  ),
  bureau: line(
    'reveal.willy.bureau', 'Willy', 'willy',
    'You think I talked to the Bureau? After all these years?',
    { focus: 'willy' },
  ),
  confirmed: line(
    'reveal.lou.confirmed', 'Big Uncle Lou', 'lou',
    'We know you did. The only question left is whether you make us hear you deny it again.',
    { focus: 'lou' },
  ),
  head: line(
    'reveal.willy.head-v2', 'Willy', 'willy',
    'I need the head. Too much coffee on the ride down. Everybody relax.',
    { focus: 'willy' },
  ),
  /* Irish is why this is a proceeding and not a murder. He is the one who
   * counts, who confirms the man was asked, and who will repeat both of those
   * things to anyone who wants to relitigate it later. Neither line accuses
   * Willy of anything Lou has not already established — that is the point of
   * him. */
  irishCount: line(
    'reveal.irish.counted', 'Irish', 'irish',
    'Four. I counted it on my fingers, twice, sitting in my own kitchen, hoping I’d get five.',
    { focus: 'irish' },
  ),
  irishAsked: line(
    'reveal.irish.asked', 'Irish', 'irish',
    'He was asked. Asked, asked again, and now. That is the whole of it and I’ll say so to anybody who asks me.',
    { focus: 'irish' },
  ),
});

export function buildNoWakeConfrontation({ beefDetected, motelPoliceHeat }) {
  return [
    REVEAL.quiet,
    REVEAL.sandwiches,
    beefDetected ? REVEAL.beefDetected : REVEAL.beefClean,
    REVEAL.pickup,
    REVEAL.irishCount,
    REVEAL.questions,
    motelPoliceHeat > 55 ? REVEAL.motelHot : REVEAL.motelClean,
    REVEAL.bureau,
    REVEAL.confirmed,
    REVEAL.irishAsked,
    REVEAL.head,
  ];
}

export const NO_WAKE_BELOW_LINES = Object.freeze([
  line(
    'below.booski.look', 'Booskibro', 'booski',
    'When he comes back, do not look at Lou. Look at Willy.',
    { focus: 'booski' },
  ),
  line(
    'below.lou.fire', 'Big Uncle Lou', 'lou',
    'You fire with us. Not after us.',
    { focus: 'lou' },
  ),
  /* And the reason Irish is aboard, said out loud in the last quiet moment:
   * his hands stay empty so that his account of this is worth something. */
  line(
    'below.irish.hands', 'Irish', 'irish',
    'My hands stay empty, kid. Somebody on this boat has to be able to say what happened out here.',
    { focus: 'irish' },
  ),
]);

export const NO_WAKE_AFTERMATH_LINES = Object.freeze({
  move: line(
    'execution.lou.move', 'Big Uncle Lou', 'lou',
    'That’s done. Help Booski get him over the side.',
  ),
  /* Irish does the one useful, unbearable thing: he makes it a procedure
   * again. Clear the rail, mind the props. He does not look at the man. */
  irishRail: line(
    'execution.irish.rail', 'Irish', 'irish',
    'Rail’s clear on this side. Take him wide of the propellers and mind your footing.',
  ),
  lift: line(
    'execution.booski.lift', 'Booskibro', 'booski',
    'Shoulders, Prospect. I’ve got his legs.',
  ),
  prospect: line(
    'execution.prospect.lift', 'Tony', 'player',
    'I’ve got him.',
  ),
  lesson: line(
    'return.lou.lesson', 'Big Uncle Lou', 'lou',
    'You did what you were told. Leave the rest of it out here.',
  ),
  /* The payoff for the ride out. He offered the back half of the egg story and
   * now nobody is having it, including him. It is the only grief anybody on
   * this boat is going to show. */
  irishNoBackHalf: line(
    'return.irish.no-back-half', 'Irish', 'irish',
    'I’m not doing the back half. Not today. Ask me at the club sometime.',
  ),
});

export const NO_WAKE_EPILOGUE_LINE = line(
  'epilogue.tony.phone', 'Tony', 'player',
  'The phone will ring when it rings.',
);

/** Every possible spoken line, including both campaign-dependent variants. */
export function allNoWakeVoiceLines() {
  return [
    ...NO_WAKE_START_LINES,
    ...NO_WAKE_AMBIENT_LINES,
    ...Object.values(REVEAL),
    ...NO_WAKE_BELOW_LINES,
    ...Object.values(NO_WAKE_AFTERMATH_LINES),
    NO_WAKE_EPILOGUE_LINE,
  ];
}
