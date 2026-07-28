/**
 * What is on the radio.
 *
 * Two stations. 97.8 THE SQUATCH is talk radio, and what is on depends on
 * the in-game hour -- the schedule below is the one the station advertises,
 * and it keeps to it. 98.8 UNCLE SQUATCH BEATS is music: it plays whatever
 * the player has dropped into assets/music/, with a station ident over the
 * top of the first track.
 *
 * Nothing here is spoken by a voice actor. You hear a radio murmuring from
 * across the room and read what it is saying, which is roughly the
 * experience of having a radio on in another room anyway.
 *
 * The 60-second station commercial is the one the player wrote, with one
 * exception: the original "Irish's Deep Dives" teaser was an antisemitic
 * conspiracy line, and that is not going in a repository. The Deep Dives
 * slot keeps its format, its kazoo and its tone; the target is now Big Egg
 * suppressing the pasture-raised truth, which at least ties back to the
 * station's own sign-off.
 */

/** A talk segment: what is said, and optionally a sound to punch it up. */
const seg = (line, cue = null) => ({ line, cue });

/* ------------------------------------------------------------------ */
/* 97.8 THE SQUATCH                                                    */
/* ------------------------------------------------------------------ */

/** The 60-second station commercial, beat by beat. */
const COMMERCIAL = [
  seg('…', 'radio.riff'),
  seg('Tired of boring radio stations that care about "facts" and "professionalism"?'),
  seg('Then tune your dial to 97.8… THE SQUATCH!', 'radio.airhorn'),
  seg('Wake up every morning with Lou & Lou! Two Lous. Zero preparation. '
    + 'Four hours of farts, aviation, friendslop and more.'),
  seg('At Noon, it’s Booski & Ape’s CS Gambling Show!', 'radio.slots'),
  seg('"Is Team Liquid an NA team? Should you bet the house on Spirit? '
    + 'Nonstop updates and news from all around the CS world!"'),
  seg('At 3 PM, it’s Irish’s Deep Dives… bringing you Real News You Can Trust.', 'radio.kazoo'),
  seg('"Tonight: is Big Egg suppressing the pasture-raised truth? '
    + 'We investigate… for way longer than necessary."'),
  seg('Then at 5 PM, don’t miss Eric & Gratin’s "What’s Happening in India!"'),
  seg('Covering headlines, cricket scores, technology, food, and somehow always '
    + 'ending with a discussion about butter chicken.'),
  seg('And when the sun goes down…', 'radio.crowd'),
  seg('It’s Hog Mama’s Late Night Improv! No script. No plan. '
    + 'No one knows what’s happening — including Hog Mama.'),
  seg('97.8 THE SQUATCH.'),
  seg('The only station where every host thinks they’re the smartest person in '
    + 'the building… and somehow they are.'),
  seg('Eat those pasture raised eggs folks!'),
  seg('97.8 THE SQUATCH. "If it’s on the air… it probably shouldn’t be."', 'radio.jingle'),
];

/**
 * The schedule. `from` is inclusive, `to` exclusive, both in 24h hours, and
 * a slot may wrap past midnight.
 */
const SQUATCH_SHOWS = [
  {
    from: 6, to: 10,
    name: 'Lou & Lou',
    strap: 'Two Lous. Zero preparation.',
    lines: [
      'LOU: …and that is why you never trust a man who owns two planes.',
      'LOU: I own two planes.',
      'LOU: I know. That is what I am telling you.',
      'LOU: Caller, you are on The Squatch. Go ahead. …Caller? They have gone.',
      'LOU: Four hours. Four hours of this. And we have not read one news item.',
      'LOU: Was that you? …It was the desk. The desk did that.',
      'LOU: Friendslop segment. Who is upset today. Start at the top.',
      'LOU: Somebody in the chat says we are "just two guys called Lou". Correct.',
      'LOU: The airport says we are not allowed back. We will fight it on air.',
      'LOU: Morning. If you are only just getting up, that is fine. Nobody is counting.',
    ],
  },
  {
    from: 12, to: 15,
    name: 'Booski & Ape’s CS Gambling Show',
    strap: 'Nonstop updates from all around the CS world.',
    lines: [
      'BOOSKI: Is Team Liquid an NA team? We have forty minutes on this.',
      'APE: Should you bet the house on Spirit? Legally I have to say no.',
      'BOOSKI: I have put my rent on a Silver lobby. Ask me how that is going.',
      'APE: Do not ask him how that is going.',
      'BOOSKI: Big news out of the major: nothing. Nothing has happened. Back after this.',
      'APE: A listener writes in: "how do I stop". We do not have that information.',
      'BOOSKI: The odds are the odds. The odds have never once been my friend.',
      'APE: If you are hearing this at work, get back to work.',
      'BOOSKI: Someone in the lobby had a 94% headshot rate. We contacted Valve. Nothing.',
    ],
  },
  {
    from: 15, to: 17,
    name: 'Irish’s Deep Dives',
    strap: 'Real News You Can Trust.',
    lines: [
      'IRISH: Tonight: is Big Egg suppressing the pasture-raised truth?',
      'IRISH: We investigate. For way longer than necessary.',
      'IRISH: I have a whiteboard. There is string on the whiteboard.',
      'IRISH: The carton says "certified humane". Certified by whom? Answer me.',
      'IRISH: I rang the number on the carton. A man answered. He was very nice. Suspicious.',
      'IRISH: Part fourteen of this investigation. Yes, fourteen. We are close.',
      'IRISH: They do not want you eating the good eggs. That is all I am saying. That is all.',
      'IRISH: Coming up after the break: more of this.',
    ],
  },
  {
    from: 17, to: 20,
    name: 'What’s Happening in India!',
    strap: 'With Eric & Gratin.',
    lines: [
      'ERIC: Headlines, cricket scores, technology, food. In that order. Usually.',
      'GRATIN: The scores first. Then, inevitably, butter chicken.',
      'ERIC: We are not going to talk about butter chicken today.',
      'GRATIN: We are going to talk about butter chicken today.',
      'ERIC: An enormous tech story out of Bengaluru, and we have four minutes.',
      'GRATIN: Make it two. I want to get to the butter chicken.',
      'ERIC: A listener has sent in a recipe. Gratin has already left the studio.',
      'GRATIN: I am in the car park. I am fine. Read the recipe.',
    ],
  },
  {
    from: 22, to: 2,
    name: 'Hog Mama’s Late Night Improv',
    strap: 'No script. No plan.',
    lines: [
      'HOG MAMA: Okay. Okay. Give me a location. …Nobody? Fine. A bus.',
      'HOG MAMA: We are on the bus. I am a dentist. Why am I a dentist.',
      'HOG MAMA: (long silence) …Still on the bus.',
      'HOG MAMA: The engineer is shaking his head at me through the glass.',
      'HOG MAMA: New scene. Same bus. I am now the bus.',
      'HOG MAMA: If you are up at this hour, you are exactly my audience and I am sorry.',
      'HOG MAMA: Somebody has called in. Do not put them through. Put them through.',
      'HOG MAMA: (a chair falls over) That was on purpose.',
    ],
  },
];

/** Filler for the hours nobody wanted. */
const OVERNIGHT = {
  name: 'Automated Overnight',
  strap: 'Nobody is in the building.',
  lines: [
    'ANNOUNCER: 97.8 The Squatch. Nobody is in the building.',
    'ANNOUNCER: The following is a repeat. Everything is a repeat.',
    'ANNOUNCER: If it’s on the air… it probably shouldn’t be.',
    'ANNOUNCER: We’ll be back at six. Probably.',
    'ANNOUNCER: Eat those pasture raised eggs folks.',
  ],
};

/* ------------------------------------------------------------------ */

export const STATIONS = [
  {
    id: 'squatch',
    dial: '97.8',
    name: '97.8 THE SQUATCH',
    tagline: 'If it’s on the air… it probably shouldn’t be.',
    kind: 'talk',
    ident: 'radio.ident.squatch',
    shows: SQUATCH_SHOWS,
    overnight: OVERNIGHT,
    commercial: COMMERCIAL,
    /** Segments of chatter between airings of the commercial. */
    commercialEvery: 7,
  },
  {
    id: 'uncle',
    dial: '98.8',
    name: 'UNCLE SQUATCH BEATS 98.8',
    tagline: 'Beats to be bored in an apartment to.',
    kind: 'music',
    ident: 'radio.ident.uncle',
    /** Shown while a track plays, and used wholesale when there are none. */
    lines: [
      'UNCLE SQUATCH: Welcome to Uncle Squatch Beats. 98.8.',
      'UNCLE SQUATCH: Nothing but beats. No talking. …That was talking.',
      'UNCLE SQUATCH: Coming up: more of these.',
      'UNCLE SQUATCH: This one goes out to whoever is still in the apartment.',
      'UNCLE SQUATCH: 98.8. Uncle Squatch. Beats.',
    ],
    /** Shown when the player has not supplied any music yet. */
    empty: [
      'UNCLE SQUATCH: Welcome to Uncle Squatch Beats. 98.8.',
      'UNCLE SQUATCH: We would play you a record, but there are no records.',
      'UNCLE SQUATCH: Drop some MP3s into assets/music/ and list them in manifest.json.',
      'UNCLE SQUATCH: Until then: this. This is the show now.',
      'UNCLE SQUATCH: 98.8. Uncle Squatch. Silence, mostly.',
    ],
  },
];

/** Which show is on `station` at `hour` (fractional 24h). */
export function showAt(station, hour) {
  if (station.kind !== 'talk') return null;
  for (const s of station.shows) {
    const on = s.from <= s.to
      ? hour >= s.from && hour < s.to
      : hour >= s.from || hour < s.to;      // wraps past midnight
    if (on) return s;
  }
  return station.overnight;
}
