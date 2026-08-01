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
    'reveal.willy.head', 'Willy', 'willy',
    'I need the head.',
    { focus: 'willy' },
  ),
});

export function buildNoWakeConfrontation({ beefDetected, motelPoliceHeat }) {
  return [
    REVEAL.quiet,
    REVEAL.sandwiches,
    beefDetected ? REVEAL.beefDetected : REVEAL.beefClean,
    REVEAL.pickup,
    REVEAL.questions,
    motelPoliceHeat > 55 ? REVEAL.motelHot : REVEAL.motelClean,
    REVEAL.bureau,
    REVEAL.confirmed,
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
]);

export const NO_WAKE_EPILOGUE_LINE = line(
  'epilogue.tony.phone', 'Tony', 'player',
  'The phone will ring when it rings.',
);

/** Every possible spoken line, including both campaign-dependent variants. */
export function allNoWakeVoiceLines() {
  return [
    ...NO_WAKE_AMBIENT_LINES,
    ...Object.values(REVEAL),
    ...NO_WAKE_BELOW_LINES,
    NO_WAKE_EPILOGUE_LINE,
  ];
}
