/**
 * What is on the radio.
 *
 * One station: 97.8 THE SQUATCH. What is on depends on the in-game hour --
 * the schedule below is the one the station advertises, and it keeps to it.
 * The station plays the roster's records between its talk, links, notices,
 * tapes, commercials, and mission-aware news. The music manifest still keeps
 * legacy `uncle` / `ksqch` tags as unresolved catalog metadata; Radio does not
 * expose those former dial positions or filter its playlist by those tags.
 *
 * Every spoken line here feeds both the runtime and tools/radio-cues.mjs.
 * Delivered takes therefore retain one discoverable cue, voice, filename,
 * current text, and take-ledger history instead of relying on captions alone.
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

/**
 * The community notice. 97.8 reads it out every so often because the station
 * and the weekly club meeting share about nine people, and it is the third way the game
 * will tell you where you are supposed to be tomorrow night -- after the note
 * on the corkboard and the messages on the second monitor. If you have the
 * radio on at all, you cannot really miss it, which is the point: the game
 * never gates on you having found something.
 *
 * This is one durable bulletin rather than eight variants of the same
 * objective. Once it airs, campaign radio history keeps it from resurfacing
 * in another room or on a later day.
 */
export const MEETING_NOTICE_ID = 'notice.meeting.day_one';
export const MEETING_NOTICE = [
  {
    line: 'ANNOUNCER: The Silver Sasquatches weekly meeting is Wednesday. Tomorrow. Seven in the evening. Members only. Routine business.',
    cue: 'radio.jingle',
    notice: true,
    bulletinId: MEETING_NOTICE_ID,
  },
];

/* ------------------------------------------------------------------ */
/* The 97.8 news minute                                                */
/* ------------------------------------------------------------------ */

/**
 * What the news desk knows about the campaign, which is never who did it.
 *
 * After each newsworthy job, the station's rotation picks up a straight-faced
 * news segment about it -- a desk reporting a strange incident from the
 * outside, with no idea the man listening is the story. Nobody is ever named:
 * the desk has witnesses, and witnesses have only ever seen an unidentified
 * large gentleman. Per the owner, only things that would actually make the
 * news are here -- no golf, no Silver Room, nothing about Margo.
 *
 * `when` reads the durable campaign save and nothing else: each gate is a
 * mission's own completed state, so a segment cannot air before its event, on
 * any receiver, ever. The radio does the scheduling (see `_refill` in
 * radio.js): a fresh segment airs soon after the player is back in the
 * apartment, is marked heard through the shared bulletin history, and then
 * settles into one low-frequency slot in the running order.
 *
 * The desk plays it dead straight -- see docs/TONE-AND-PARODY.md. The comedy
 * is the wire's usual comedy: what officials will not say, said officially.
 */
export const NEWS_SEGMENTS = Object.freeze([
  {
    /* The Bada Bing incident night: a man gone after a closed party. */
    id: 'news.segment.bing_night',
    when: (state) => state?.missions?.bada_bing_two?.status === 'complete',
    lines: [
      'ANNOUNCER: The news at the top of the hour. Police are asking for information about a man reported missing after a private party at a nightclub on the east side.',
      'ANNOUNCER: Guests describe a lively evening, a disagreement nobody saw, and a car park with one more car in it than there were owners to drive them home.',
      'ANNOUNCER: Staff say the night was completely ordinary. They say it in the same words, in the same order, every time they are asked.',
      'ANNOUNCER: Anyone with information is asked to come forward. So far nobody has any. Sport after the break.',
    ],
  },
  {
    /* The Jerky Motel: the county road, the cargo, the smell. */
    id: 'news.segment.motel',
    when: (state) => state?.missions?.jerky_motel?.status === 'complete',
    lines: [
      'ANNOUNCER: An update from the county road, where police spent the morning at a roadside motel and will not say why.',
      'ANNOUNCER: Officers removed what one witness describes as boxes, and what a second witness describes as a lot of boxes.',
      'ANNOUNCER: Rumors that the cargo was jerky remain unconfirmed. The smell, our reporter notes, does not.',
      'ANNOUNCER: The motel says it is open for business. The county road is not.',
    ],
  },
  {
    /* NO WAKE: a boating accident on the lake, one missing. */
    id: 'news.segment.lake',
    when: (state) => state?.missions?.no_wake?.status === 'complete',
    lines: [
      'ANNOUNCER: From the lake — the search has been suspended after a boating incident left one man unaccounted for.',
      'ANNOUNCER: The vessel returned to the marina with fewer passengers than it left with. The remaining passengers describe a calm and pleasant afternoon.',
      'ANNOUNCER: Nobody on board recalls the missing man being on board, including the man who invited him.',
      'ANNOUNCER: The lake has been asked for comment. The lake is calm.',
    ],
  },
  {
    /* THE TAKE: the big one. Brazen, daylight, and every hostage fine. */
    id: 'news.segment.heist',
    when: (state) => state?.missions?.bank_heist?.status === 'complete',
    lines: [
      'ANNOUNCER: Our top story remains the daylight robbery at Cumberland Fidelity, where an armed crew emptied the vault and shot their way out of downtown.',
      'ANNOUNCER: Every hostage walked out unharmed. Several describe the gunmen as polite, professional, and considerably larger than the doors.',
      'ANNOUNCER: Witnesses describe the man carrying the duffel bags as an unidentified large gentleman. Witnesses describe the other four the same way.',
      'ANNOUNCER: Police have released a description. The description is: large. Further details as they refuse to develop.',
      'ANNOUNCER: The bank reopens Monday. The vault, we are told, needs longer.',
    ],
  },
  {
    /* The mansion siege: an armed assault on a private estate, repelled. */
    id: 'news.segment.estate',
    when: (state) => state?.missions?.mansion_siege?.status === 'complete',
    lines: [
      'ANNOUNCER: Police have confirmed an armed assault overnight on a private estate outside the city, repelled before officers arrived.',
      'ANNOUNCER: The homeowner, described as a retired businessman, declined to be interviewed, photographed, or approached.',
      'ANNOUNCER: Neighbors report roughly twenty minutes of sustained gunfire, which the estate’s groundskeeper attributes to raccoons.',
      'ANNOUNCER: No arrests have been made. No attackers could be located to arrest.',
    ],
  },
  {
    /* The Enola Squatch: somebody bombed a city and nobody knows who. */
    id: 'news.segment.detonation',
    when: (state) => state?.missions?.enola_squatch?.status === 'complete',
    lines: [
      'ANNOUNCER: International news. Authorities overseas are investigating a large unexplained detonation outside a coastal city late last night.',
      'ANNOUNCER: Residents report a single aircraft, a very bright light, and a cloud one witness would only describe as historically shaped.',
      'ANNOUNCER: Air-defense batteries were active for most of an hour. Officials confirm they hit nothing, and have asked us to emphasize that they were close.',
      'ANNOUNCER: No group has claimed responsibility. Aviation records show no aircraft of that size registered to anybody sensible.',
    ],
  },
  {
    /* The cartel palace: a succession, reported at a careful distance. */
    id: 'news.segment.compound',
    when: (state) => state?.missions?.cartel_palace?.status === 'complete',
    lines: [
      'ANNOUNCER: Overseas again — officials are investigating an outbreak of violence at a fortified private compound south of the border.',
      'ANNOUNCER: The compound belonged to a businessman described in the regional press as an agricultural exporter, with the quotation marks audible.',
      'ANNOUNCER: Sources report a change of leadership in the local organization. The new leadership has not been named, located, or seen.',
      'ANNOUNCER: Regional authorities have declared the matter internal, closed, and none of anyone’s business, in that order.',
    ],
  },
  {
    /* PROJECT SILENT SQUATCH, at the only distance the public gets: some
     * scientists stopped answering their phones. Deliberately vague -- the
     * night is a secret and the wire only has the edges of it. Gated on
     * scientists actually being lost, because families only ring the station
     * about people who did not come home. */
    id: 'news.segment.scientists',
    when: (state) => state?.missions?.silent_squatch?.status === 'complete'
      && (state?.missions?.silent_squatch?.scientistsLost ?? 0) > 0,
    lines: [
      'ANNOUNCER: A strange one from the wire. The families of several research scientists say they have been unable to reach them for days.',
      'ANNOUNCER: Their employer cannot be reached either. Calls to the listed number reach a man who says there is no listed number.',
      'ANNOUNCER: The scientists were last seen leaving for a private contract at an undisclosed residence. That is the entire sentence we have been given.',
      'ANNOUNCER: Police are not treating the matter as suspicious, on the grounds that they have not been told about it.',
    ],
  },
].map((segment) => Object.freeze({ ...segment, lines: Object.freeze(segment.lines) })));

/**
 * The segments whose events have happened, in campaign order. Pure: reads the
 * durable save it is handed and mutates nothing -- campaign state is the
 * missions' to write. A gate that throws on a malformed save reports the
 * segment ineligible rather than taking the station down with it.
 */
export function newsSegmentsFor(state) {
  return NEWS_SEGMENTS.filter((segment) => {
    try { return segment.when(state) === true; } catch { return false; }
  });
}

/* ------------------------------------------------------------------ */
/* 97.8 THE SQUATCH                                                    */
/* ------------------------------------------------------------------ */

/** The station's own promo, beat by beat. */
const COMMERCIAL_STATION = [
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

/** Lou's jerky, sold the way a family business sells anything. */
const COMMERCIAL_JERKY = [
  seg('…', 'radio.riff'),
  seg('A word about LOU’S ORIGINAL JERKY.'),
  seg('Three generations. One smokehouse. Same building on Route 9 since '
    + 'nineteen fifty-one, and the same recipe, because nobody has ever been '
    + 'allowed to write it down.'),
  seg('Big Uncle Lou still comes in at four in the morning to check the racks '
    + 'himself. Ask anybody. They’ll tell you. They’ll tell you quickly.'),
  seg('No fillers. No additives. Nothing in it that wasn’t walking around this '
    + 'county a week ago.'),
  seg('LOU’S ORIGINAL JERKY. Available at fine retailers, and at several '
    + 'retailers who have not been asked.'),
  seg('Because family is everything.', 'radio.jingle'),
];

/** A criminal defence attorney's personal injury ad. */
const COMMERCIAL_ATTORNEY = [
  seg('…', 'radio.riff'),
  seg('Have you been hurt? Have you hurt somebody? Either one. Call the number.'),
  seg('I’m Vincent Marrow, and for twenty-two years I have stood beside the '
    + 'people of this county at what I would describe as the worst moment of '
    + 'their lives.'),
  seg('Slip and fall. Dog bite. Boating accident with an unclear number of '
    + 'people on the boat when it left and when it came back.'),
  seg('I don’t judge. I have never judged. Judging is somebody else’s job in '
    + 'that building and frankly they are not good at it either.'),
  seg('No fee unless we win. No questions at all, ever, about anything, at any '
    + 'point in our relationship.'),
  seg('MARROW AND ASSOCIATES. There are no associates.'),
  seg('Do not talk to anyone. Talk to me.', 'radio.jingle'),
];

/** A man screaming about financing, until he stops. */
const COMMERCIAL_DEALERSHIP = [
  seg('…', 'radio.airhorn'),
  seg('SUNDAY! SUNDAY! SUNDAY! at BUDDY GRAVES AUTOMOTIVE on the Old Post Road!'),
  seg('EVERY TRUCK ON THE LOT! EVERY CAR ON THE LOT! EVERY VEHICLE MY WIFE’S '
    + 'BROTHER LEFT ON THE LOT!'),
  seg('ZERO DOWN! ZERO INTEREST! ZERO CREDIT CHECK! ZERO PAPERWORK OF ANY KIND '
    + 'THAT COULD LATER BE PRODUCED!'),
  seg('WE WILL BEAT ANY PRICE! WE WILL BEAT ANY OFFER! WE HAVE BEATEN OFFERS '
    + 'THAT WERE NEVER MADE!'),
  seg('IF YOU CAN GET HERE, YOU CAN DRIVE HOME! IF YOU CANNOT GET HERE, WE WILL '
    + 'COME AND GET YOU, AND WE HAVE.'),
  seg('BUDDY GRAVES AUTOMOTIVE! OLD POST ROAD! SUNDAY!', 'radio.airhorn'),
  seg('…'),
  seg('Come down and see me. Please. Anybody. Come down and see me on Sunday.'),
];

/**
 * The ad break rotates. One commercial on a loop is the tell that a radio
 * station is scenery; four is a station that has advertisers, and the ad break
 * is where this world gets to be as crude as it likes, because nobody in an
 * advert is a character in a scene.
 *
 * `live` is what separates a written break from an aired one. Every break here
 * is indexed and therefore queued for recording, but only a live one reaches
 * the running order -- a break whose takes have not been delivered would air as
 * silence, and NO WAKE in particular is gated on preloading nothing it cannot
 * play. Flip `live` to true once the lines are in `assets/sfx/index.json`.
 */
const COMMERCIALS = [
  { id: 'station', live: true, segments: COMMERCIAL_STATION },
  { id: 'jerky', live: true, segments: COMMERCIAL_JERKY },
  { id: 'attorney', live: true, segments: COMMERCIAL_ATTORNEY },
  { id: 'dealership', live: true, segments: COMMERCIAL_DEALERSHIP },
];

/**
 * The schedule. `from` is inclusive, `to` exclusive, both in 24h hours, and
 * a slot may wrap past midnight.
 */
const SQUATCH_SHOWS = [
  {
    from: 6, to: 10,
    name: "Lou & Lou",
    strap: "Two Lous. Zero preparation.",
    exchanges: [
      [
        "LOU: Morning. If you are only just getting up, that is fine. Nobody is counting.",
        "LOU: If you are eating breakfast right now, you are ahead of most of our audience.",
        "LOU: If you are not eating breakfast right now, we are not going to make a thing of it.",
      ],
      [
        "LOU: \u2026and that is why you never trust a man who owns two planes.",
        "LOU: I own two planes.",
        "LOU: I know. That is what I am telling you.",
      ],
      [
        "LOU: I want to open with a correction. Not to anything. Just as a format.",
        "LOU: The other Lou is not here yet. I am both Lous this morning.",
        "LOU: He has walked in. He has heard that. He is making a face.",
      ],
      [
        "LOU: Aviation corner. Today: a plane I like. That is the whole segment.",
        "LOU: You cannot land there. I want to be clear that you cannot land there.",
        "LOU: I have landed there.",
      ],
      [
        "LOU: Friendslop segment. Who is upset today. Start at the top.",
        "LOU: A man has written in to say we have never once helped him. Noted, and kept.",
      ],
      /* The seed oil arc. Runs across three exchanges because the joke is the
       * escalation, not any one line -- he starts with an app and ends up
       * afraid of a tin of soup. */
      [
        "LOU: I have got an app now. You point it at food and it scores it out of a hundred.",
        "LOU: What did the eggs get.",
        "LOU: I have not done the eggs. I am not doing the eggs.",
        "LOU: You are frightened of what the eggs are going to say.",
      ],
      [
        "LOU: There is a second app and this one is specifically about the seed oils.",
        "LOU: Finds them where.",
        "LOU: In everything, Lou. That is the entire point. It is a first-class signal.",
        "LOU: What is a first-class signal.",
        "LOU: I do not know. It says it on the website.",
      ],
      [
        "LOU: I scanned a tin of soup this morning and it gave me a little face.",
        "LOU: A good face or a bad face.",
        "LOU: A disappointed face.",
        "LOU: Then that is the soup sorted, and we never speak of it again.",
      ],
      [
        "LOU: Four hours. Four hours of this. And we have not read one news item.",
        "LOU: There is a news wire in this building. I have seen it. I have never read it.",
        "LOU: Producer says we have to do a news item. Fine. Something happened. Moving on.",
      ],
      [
        "LOU: The chat wants the fart segment. The chat always wants the fart segment.",
        "LOU: We are not doing the fart segment before eight. We have standards until eight.",
        "LOU: It is eight.",
      ],
      [
        "LOU: Caller, you are on The Squatch. Go ahead. \u2026Caller? They have gone.",
        "LOU: Was that you? \u2026It was the desk. The desk did that.",
      ],
      [
        "LOU: Somebody in the chat says we are \"just two guys called Lou\". Correct.",
        "LOU: The airport says we are not allowed back. We will fight it on air.",
      ],
      [
        "LOU: Weather: it is doing something out there. Look out of a window.",
        "LOU: Traffic report. There is traffic. It is on the roads.",
      ],
      [
        "LOU: Quick reminder that this show is four hours long and nobody made us do that.",
        "LOU: We are going to a break, which for us means one of us stops talking.",
      ],
    ],
  },
  {
    from: 10, to: 12,
    name: "The Rerun Hour",
    strap: "We could not fill it.",
    exchanges: [
      [
        "ANNOUNCER: The Rerun Hour. Two hours the station could not fill, filled.",
        "ANNOUNCER: Nobody is in the studio. The tape is doing this by itself.",
        "ANNOUNCER: If you have just tuned in: you have missed nothing, ever.",
      ],
      [
        "LOU: (tape) \u2026and that is why you never trust a man who owns two planes.",
        "ANNOUNCER: That was from this morning. Four hours ago. We are aware.",
      ],
      [
        "HOG MAMA: (tape) New scene. Same bus. I am now the bus.",
        "ANNOUNCER: We have been asked not to explain that one.",
      ],
      [
        "IRISH: (tape) There is string on the whiteboard.",
        "ANNOUNCER: There is, in fairness, string on the whiteboard.",
      ],
      [
        "BOOSKI: (tape) Ask me how that is going.",
        "ANNOUNCER: We did ask. It went badly.",
      ],
      [
        "ANNOUNCER: Mid-morning on 97.8. Statistically, you should be at work.",
        "ANNOUNCER: A listener asks if the Rerun Hour is ever going to be new. No.",
      ],
      [
        "ANNOUNCER: Coming up at noon: two men and a betting slip.",
        "ANNOUNCER: Eat those pasture raised eggs folks. That one is live. That one we mean.",
        "ANNOUNCER: 97.8 The Squatch. This hour brought to you by having nothing else.",
      ],
    ],
  },
  {
    from: 12, to: 15,
    name: "Booski & Ape\u2019s CS Gambling Show",
    strap: "Nonstop updates from all around the CS world.",
    exchanges: [
      [
        "BOOSKI: Is Team Liquid an NA team? We have forty minutes on this.",
        "BOOSKI: Is Team Liquid an NA team. We are forty minutes in. No progress.",
        "APE: I want to note that neither of us has ever been to North America.",
      ],
      [
        "BOOSKI: I have put my rent on a Silver lobby. Ask me how that is going.",
        "APE: Do not ask him how that is going.",
      ],
      [
        "BOOSKI: Nobody on this show has ever been up.",
        "APE: Correction: Booski was up, once, in 2019, for about forty minutes.",
        "BOOSKI: Best forty minutes of my life and I gave it all back before dinner.",
      ],
      [
        "BOOSKI: The lobby last night had a guy pre-firing every angle. Every single one.",
        "APE: Was he cheating, or are you just slow? We open the phones.",
        "BOOSKI: Do not open the phones.",
      ],
      [
        "BOOSKI: A knife opened for me last night. Blue gem. Wrong pattern. Worth nothing.",
        "APE: It is worth something. It is worth about as much as a knife.",
      ],
      [
        "APE: Today\u2019s slate: one match, in a region we cannot pronounce, at 4 AM.",
        "BOOSKI: I will be up for it. I am always up for it. That is the problem.",
        "APE: We have a caller who says he is \"up\". He is not up. He is down.",
      ],
      [
        "APE: A listener writes in: \"how do I stop\". We do not have that information.",
        "BOOSKI: A listener says he has stopped. Genuinely stopped. We wish him well.",
        "APE: We wish him well and we will never hear from him again.",
      ],
      [
        "APE: Should you bet the house on Spirit? Legally I have to say no.",
        "BOOSKI: The odds are the odds. The odds have never once been my friend.",
      ],
      [
        "BOOSKI: Someone in the lobby had a 94% headshot rate. We contacted Valve. Nothing.",
        "BOOSKI: Big news out of the major: nothing. Nothing has happened. Back after this.",
      ],
      [
        "APE: Here is the thing about Spirit. \u2026I have lost it. I had a thing about Spirit.",
        "APE: Sponsor read. We do not have a sponsor. That was the read.",
      ],
      [
        "APE: If you are hearing this at work, get back to work.",
        "BOOSKI: If you play this game and you have fun, please write in, because we are curious.",
        "APE: Back after this with more of exactly this.",
      ],
    ],
  },
  {
    from: 15, to: 17,
    name: "Irish\u2019s Deep Dives",
    strap: "Real News You Can Trust.",
    exchanges: [
      [
        "IRISH: Tonight: is Big Egg suppressing the pasture-raised truth?",
      ],
      [
        "IRISH: We investigate. For way longer than necessary.",
      ],
      [
        "IRISH: I have a whiteboard. There is string on the whiteboard.",
      ],
      [
        "IRISH: The carton says \"certified humane\". Certified by whom? Answer me.",
      ],
      [
        "IRISH: I rang the number on the carton. A man answered. He was very nice. Suspicious.",
      ],
      [
        "IRISH: Part fourteen of this investigation. Yes, fourteen. We are close.",
      ],
      [
        "IRISH: They do not want you eating the good eggs. That is all I am saying. That is all.",
      ],
      [
        "IRISH: Coming up after the break: more of this.",
      ],
      [
        "IRISH: \"Pasture raised.\" Pasture. Raised. Say it slowly and tell me it sounds normal.",
      ],
      [
        "IRISH: I have been to a pasture. I have never once seen it raising anything.",
      ],
      [
        "IRISH: A producer has asked me to move on. Note who asked. Note it.",
      ],
      [
        "IRISH: Twelve eggs. Always twelve. Why twelve. Nobody will tell me why twelve.",
      ],
      [
        "IRISH: I bought a carton from four different shops. Same carton. Same twelve.",
      ],
      [
        "IRISH: We had a whistleblower. He now says he was talking about a different egg.",
      ],
      [
        "IRISH: They got to him. Or he was talking about a different egg. I accept both.",
      ],
      [
        "IRISH: Somebody has emailed to say I am describing normal farming. Sent from a work address.",
      ],
      [
        "IRISH: I am not saying the hens are in on it. The hens are victims here.",
      ],
      [
        "IRISH: New string on the board today. Red string. Red is for the serious connections.",
      ],
      [
        "IRISH: The board is now larger than the studio door. We have discussed this at length.",
      ],
      [
        "IRISH: If I stop broadcasting suddenly, it was the eggs. Put that in writing somewhere.",
      ],
      [
        "IRISH: Part fifteen is recorded. Legal has asked to hear it first. Interesting.",
      ],
      [
        "IRISH: Real News You Can Trust. That is not a slogan, that is a promise, and it is both.",
      ],
      [
        "IRISH: We will be right back, unless we are not, in which case: the eggs.",
      ],
    ],
  },
  {
    from: 17, to: 20,
    name: "What\u2019s Happening in India!",
    strap: "With Eric & Gratin.",
    exchanges: [
      [
        "ERIC: Headlines, cricket scores, technology, food. In that order. Usually.",
      ],
      [
        "GRATIN: The scores first. Then, inevitably, butter chicken.",
      ],
      [
        "ERIC: We are not going to talk about butter chicken today.",
      ],
      [
        "GRATIN: We are going to talk about butter chicken today.",
      ],
      [
        "ERIC: An enormous tech story out of Bengaluru, and we have four minutes.",
      ],
      [
        "GRATIN: Make it two. I want to get to the butter chicken.",
      ],
      [
        "ERIC: A listener has sent in a recipe. Gratin has already left the studio.",
      ],
      [
        "GRATIN: I am in the car park. I am fine. Read the recipe.",
      ],
      [
        "ERIC: Drive time on 97.8. If you are driving, this is your show. If not, also.",
      ],
      [
        "GRATIN: Cricket first. Somebody scored a lot of runs. It was very good.",
      ],
      [
        "ERIC: That is the whole report. He does not follow it, he just likes the numbers.",
      ],
      [
        "GRATIN: I like the numbers. The numbers go up. It is a good sport.",
      ],
      [
        "ERIC: Mumbai traffic update, for our listeners in Mumbai, of whom there are none.",
      ],
      [
        "GRATIN: There is one. He writes in every week. Hello, Sanjay.",
      ],
      [
        "ERIC: Sanjay says the traffic update is inaccurate and he has stopped listening.",
      ],
      [
        "GRATIN: Hello anyway, Sanjay.",
      ],
      [
        "ERIC: Tech story: a company in Hyderabad has done something clever with batteries.",
      ],
      [
        "GRATIN: Does it cook anything?",
      ],
      [
        "ERIC: It does not cook anything.",
      ],
      [
        "GRATIN: Then I have no follow-up questions.",
      ],
      [
        "ERIC: I am going to get through one headline today without food coming up.",
      ],
      [
        "GRATIN: A new bridge has opened. Near a restaurant. A very good restaurant.",
      ],
      [
        "ERIC: We were four seconds from it. Four.",
      ],
      [
        "GRATIN: If you are heading out this evening, eat first. That is not news, it is advice.",
      ],
      [
        "ERIC: Some of our audience are getting ready to go somewhere right now. Godspeed.",
      ],
      [
        "GRATIN: Shower. Clean shirt. Eat. In that order. It is not complicated.",
      ],
    ],
  },
  {
    from: 20, to: 22,
    name: "The Squatch Evening Desk",
    strap: "One man, one desk, no material.",
    exchanges: [
      [
        "APE: Evening. It is me. It is just me. Everyone else has gone home.",
      ],
      [
        "APE: This slot has no format. They gave me two hours and a chair.",
      ],
      [
        "APE: I am going to read out things people have sent in. Some of it is not for radio.",
      ],
      [
        "APE: \"Dear Squatch, is it normal to have a beer while you get ready.\" Yes. Next.",
      ],
      [
        "APE: \"Dear Squatch, is it normal to have four.\" That is a different letter.",
      ],
      [
        "APE: The building is empty. The lights are on a timer and the timer has opinions.",
      ],
      [
        "APE: If you are getting an early night, good for you, genuinely.",
      ],
      [
        "APE: If you are not, Hog Mama is on at ten and that is your own fault.",
      ],
      [
        "APE: I have been handed a piece of paper. It says \"20 more minutes\". That is all it says.",
      ],
      [
        "APE: Music? No. This is a talk station. We are committed to the bit.",
      ],
      [
        "APE: Quiet evening out there. You can hear the city doing its thing.",
      ],
      [
        "APE: Whatever you are supposed to be doing tonight, this is not stopping you.",
      ],
      [
        "APE: 97.8. Still on the air. Still probably should not be.",
      ],
    ],
  },
  {
    from: 22, to: 2,
    name: "Hog Mama\u2019s Late Night Improv",
    strap: "No script. No plan.",
    exchanges: [
      [
        "HOG MAMA: Okay. Okay. Give me a location. \u2026Nobody? Fine. A bus.",
      ],
      [
        "HOG MAMA: We are on the bus. I am a dentist. Why am I a dentist.",
      ],
      [
        "HOG MAMA: (long silence) \u2026Still on the bus.",
      ],
      [
        "HOG MAMA: The engineer is shaking his head at me through the glass.",
      ],
      [
        "HOG MAMA: New scene. Same bus. I am now the bus.",
      ],
      [
        "HOG MAMA: If you are up at this hour, you are exactly my audience and I am sorry.",
      ],
      [
        "HOG MAMA: Somebody has called in. Do not put them through. Put them through.",
      ],
      [
        "HOG MAMA: (a chair falls over) That was on purpose.",
      ],
      [
        "HOG MAMA: Give me an occupation. \u2026The engineer says \"no\". I am a No.",
      ],
      [
        "HOG MAMA: Scene: a man cannot sleep. He is listening to a woman being a bus.",
      ],
      [
        "HOG MAMA: That is you. You are the man. Hello.",
      ],
      [
        "HOG MAMA: I am going to do an impression. Of the desk. \u2026That is the impression.",
      ],
      [
        "HOG MAMA: Nobody has ever laughed at that and I do it every night.",
      ],
      [
        "HOG MAMA: New scene. Two people. Both me. They are arguing and I am losing.",
      ],
      [
        "HOG MAMA: (very long silence) \u2026I am thinking. I am allowed to think.",
      ],
      [
        "HOG MAMA: The clock says it is late enough that this counts as art.",
      ],
      [
        "HOG MAMA: Somebody in the chat has typed one word: \"why\". Fair. Good note.",
      ],
      [
        "HOG MAMA: I want to try something. It will not work. Here it is anyway.",
      ],
      [
        "HOG MAMA: (it did not work) Right. Yes. As predicted.",
      ],
      [
        "HOG MAMA: If you have to be up in the morning, turn this off. I mean it. Go.",
      ],
      [
        "HOG MAMA: You are still here. Okay. Then we are doing the bus again.",
      ],
      [
        "HOG MAMA: I have been on this bus for four years. Nobody has ever got off.",
      ],
      [
        "HOG MAMA: Last one. Give me a location. \u2026The apartment. Fine. The apartment.",
      ],
    ],
  },
];

/** Filler for the hours nobody wanted. */
const OVERNIGHT = {
  name: 'Automated Overnight',
  strap: 'Nobody is in the building.',
  exchanges: [
    [
      'ANNOUNCER: 97.8 The Squatch. Nobody is in the building.',
      'ANNOUNCER: This is an automated broadcast. There is nobody to complain to.',
      'ANNOUNCER: The overnight tape has been running for eleven years.',
    ],
    [
      'ANNOUNCER: The following is a repeat. Everything is a repeat.',
      'ANNOUNCER: A reminder that nothing on this station has ever been checked.',
    ],
    [
      'ANNOUNCER: Hog Mama has left the building. She left the microphone on.',
      'ANNOUNCER: (silence, then a click) …That was the tape. The tape does that.',
    ],
    [
      'ANNOUNCER: If you are awake, that is between you and the ceiling.',
      'ANNOUNCER: Whatever you were going to do tonight, you have done it now.',
    ],
    [
      'ANNOUNCER: 97.8. Broadcasting to an empty city at an unreasonable hour.',
      'ANNOUNCER: Lou & Lou at six. Both Lous. Allegedly.',
      'ANNOUNCER: We’ll be back at six. Probably.',
    ],
    [
      'ANNOUNCER: If it’s on the air… it probably shouldn’t be.',
      'ANNOUNCER: Eat those pasture raised eggs folks.',
    ],
  ],
};

/* ------------------------------------------------------------------ */

/*
 * One station.
 *
 * It used to be three -- talk on 97.8, the roster's records split across two
 * music frequencies -- which meant the music and the shows could never be in
 * the same broadcast, and tuning was a way of choosing which half of the
 * station to miss. A real local station plays its own bands between its own
 * shows, so this one does. [R] still skips, but it skips a whole block now:
 * the rest of an exchange, or the record that is on.
 */
export const STATIONS = [
  {
    id: 'squatch',
    dial: '97.8',
    name: '97.8 THE SQUATCH',
    tagline: 'If it\u2019s on the air\u2026 it probably shouldn\u2019t be.',
    kind: 'talk',
    ident: 'radio.ident.squatch',
    shows: SQUATCH_SHOWS,
    overnight: OVERNIGHT,
    commercials: COMMERCIALS,
    /** This station reads the community notice. */
    notices: true,
    /**
     * Blocks that must air before the notice can. Waking up to a man reading
     * out where you are supposed to be tomorrow is the game telling you its
     * goal in the first ten seconds; letting the station be a station for a
     * while first means you find it rather than are handed it.
     */
    noticeAfter: 5,
    /** Lines the DJ drops over the top and tail of a record. */
    lines: [
      'That was one of ours. All of them are ours.',
      'Every record on this station was made by somebody in this group.',
      'That is not a boast. It is closer to a disclosure.',
      'Requests are open. Requests have always been open. Nobody has ever rung.',
      'This one charted. Internally. Among us.',
      'If you know the words, you were probably there when it was written.',
      'Somebody mixed this in a basement on monitors that cost forty dollars.',
      'That was written in one night. You can tell. We are not hiding it.',
      'No royalties have ever been paid. No royalties have ever been owed.',
      'Turn it up. Nobody in this building is going to stop you.',
      '97.8 The Squatch. The roster, on the roster.',
    ],
    /**
     * Tapes. Not records and not the station's own people: recordings that
     * turned up, which the station airs whole because it has four hours to
     * fill and somebody else already filled thirty-four seconds of it.
     *
     * `cue` is a cue in assets/sfx/ like any other, so it is fetched, decoded
     * and positioned the same way a host is -- and the block runs for exactly
     * as long as the recording does rather than a guessed dwell.
     */
    tapes: [
      {
        cue: 'radio.tape.richguys',
        title: 'TAPE — "One Week Without The Housekeeper"',
        intro: 'ANNOUNCER: Tape segment. A listener sent this in. Two wealthy men, left alone with their own laundry.',
        outro: 'ANNOUNCER: One week a year. Every year. Our thoughts are with them.',
      },
    ],
    /** Shown when the player has not supplied any music yet. */
    empty: [
      '97.8 The Squatch. We would play you a record, but there are no records.',
      'Drop some MP3s into assets/music/ and list them in manifest.json.',
      'Until then: this. This is the show now.',
    ],
  },
];

/** Exact written copy for the station's dynamically selected show link. */
export function showIntroLine(show) {
  const separator = /[.!?]$/.test(show.name) ? ' ' : '. ';
  return `ANNOUNCER: Next on 97.8 The Squatch — ${show.name}${separator}${show.strap}`;
}

/** The two voices that briefly break into the apartment radio's schedule. */
export const SPOOKY_RADIO_LINES = Object.freeze([
  Object.freeze({ line: '— and he is still in the flat with y—', voice: 'unknown' }),
  Object.freeze({ line: '…which is the traffic. Back to Lou.', voice: 'announcer' }),
]);

/* ------------------------------------------------------------------ */

/**
 * Every line above is written as `SPEAKER: words`, and the speaker decides
 * which voice reads it. This is the only place that mapping exists -- the
 * generator (tools/radio-cues.mjs) and the radio itself both read it from
 * here, so a new host needs adding in one place, not three.
 *
 * A line with no prefix belongs to whoever owns the block it is in: the
 * commercial is the station announcer, KSQCH's chatter is its own DJ.
 */
const SPEAKERS = {
  'BOOSKI': 'booski',
  'APE': 'ape',
  'IRISH': 'irish',
  'ERIC': 'eric',
  'GRATIN': 'gratin',
  'HOG MAMA': 'hogmama',
  'ANNOUNCER': 'announcer',
  'UNCLE SQUATCH': 'uncle',
};

/** `HOG MAMA: (a chair falls over) That was on purpose.` -> the speaker key. */
function speakerOf(line, fallback) {
  const m = /^([A-Z][A-Z '’]*[A-Z]):\s*/.exec(line);
  if (!m) return fallback;
  return SPEAKERS[m[1]] ?? fallback;
}

/**
 * What actually gets spoken. Drops the `SPEAKER:` label and any stage
 * direction in brackets -- "(long silence)" is an instruction to the reader,
 * not a thing to read out, and text-to-speech will happily say it.
 */
function spokenText(line) {
  return line
    .replace(/^[A-Z][A-Z '’]*[A-Z]:\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nothing worth generating: an ellipsis beat, or a line that was all stage direction. */
const sayable = (text) => /[a-z0-9]/i.test(text);

/**
 * Walk everything on air once and give each distinct utterance a cue name.
 * Deduped by voice + text, so the two Uncle Squatch blocks that share an
 * opening line share one clip instead of generating it twice.
 */
/**
 * Stable short name for a line, derived from the text itself.
 *
 * These used to be numbered in encounter order -- radio.vo.lou1.7 was simply
 * the seventh Lou line the walker reached. That is fine until the script is
 * reordered, at which point every number shifts and 94 of 214 clips are
 * suddenly attached to somebody else's sentence, with nothing to notice it:
 * the files exist, the names resolve, the radio just says the wrong thing.
 *
 * Naming from content instead means a line keeps its clip wherever it moves
 * to, and reordering the schedule is free. FNV-1a, base36, which is plenty of
 * room for a few hundred lines.
 */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-7);
}

function buildVoiceIndex() {
  const byKey = new Map();      // `${voice} ${text}` -> cue name
  const byLine = new Map();     // original line string      -> { cue, voice }
  const counts = new Map();

  const add = (line, fallback) => {
    const text = spokenText(line);
    if (!sayable(text)) return;
    const voice = speakerOf(line, fallback);
    const key = `${voice} ${text}`;
    let cue = byKey.get(key);
    if (!cue) {
      cue = `radio.vo.${voice}.${hash(key)}`;
      byKey.set(key, cue);
    }
    // Same text under two speakers is two clips; keyed by line, last wins,
    // which is fine because the text is what decides the audio.
    byLine.set(line, { cue, voice, text });
  };

  for (const st of STATIONS) {
    /* `_refill()` composes these from the clock-selected show. Enumerate the
     * finite schedule here so dynamic copy still receives stable exact cues. */
    for (const show of [...(st.shows ?? []), st.overnight].filter(Boolean)) {
      add(showIntroLine(show), 'announcer');
    }
    /* Two Lous, because "two guys called Lou" only reads as a joke if you can
     * hear that there are two of them. Which Lou a line belongs to is decided
     * by the line itself, not by its position -- alternating on encounter
     * order meant reordering the script swapped who said what, and a clip
     * recorded in one Lou's voice would be asked for in the other's. */
    // Shows and the overnight tape are exchanges now: runs of lines that air
    // together. Flatten them for indexing -- the voice a line gets depends on
    // who says it, not on which run it sits in.
    const walk = (block) => {
      for (const ex of block?.exchanges ?? []) {
        /* Alternate the Lous WITHIN the bit. Hashing each line on its own was
         * stable but scattered -- a three-line exchange could come out all one
         * Lou, and "two guys called Lou" only lands if you hear the other one
         * answer. Seeding from the exchange's opening line keeps it stable
         * against reordering while guaranteeing they take turns inside it. */
        const seed = parseInt(hash(ex[0]), 36);
        let n = 0;
        for (const line of ex) {
          const isLou = /^LOU:/.test(line);
          add(line, isLou ? ((seed + n++) % 2 ? 'lou2' : 'lou1') : 'announcer');
        }
      }
    };
    for (const show of st.shows ?? []) walk(show);
    walk(st.overnight);
    /* Every authored break is indexed, live or not: that is what puts an
     * unrecorded ad on the booth sheet in the first place. */
    for (const ad of st.commercials ?? []) {
      for (const seg of ad.segments) add(seg.line, 'announcer');
    }
    if (st.notices) for (const seg of MEETING_NOTICE) add(seg.line, 'announcer');
    /* The news minute belongs to the station that reads the wire. Every
     * segment is indexed whether or not its event has happened -- eligibility
     * is a runtime question, the clip ledger is not. */
    if (st.notices) {
      for (const segment of NEWS_SEGMENTS) {
        for (const line of segment.lines) add(line, 'announcer');
      }
    }
    for (const line of st.lines ?? []) add(line, 'announcer');
    /* A tape's own audio is a file somebody recorded, not something to
     * generate -- but the announcer topping and tailing it is a line like any
     * other, and gets a clip like any other. */
    for (const tape of st.tapes ?? []) { add(tape.intro, 'announcer'); add(tape.outro, 'announcer'); }
    /* `empty` is the developer hint shown when assets/music/ has nothing in
     * it. It tells you to go and add files, which is not something a radio
     * host says, and it cannot air at all once there is music. Not voiced. */
  }
  for (const interruption of SPOOKY_RADIO_LINES) add(interruption.line, interruption.voice);
  return byLine;
}

const VOICE_INDEX = buildVoiceIndex();

/** The generated clip for a line, or null if it has none. */
export function voiceOf(line) {
  return VOICE_INDEX.get(line) ?? null;
}

/** Everything that needs generating, for tools/radio-cues.mjs. */
export function voiceCues() {
  const seen = new Set();
  const out = [];
  for (const { cue, voice, text } of VOICE_INDEX.values()) {
    if (seen.has(cue)) continue;
    seen.add(cue);
    out.push({ name: cue, voice, say: text });
  }
  return out;
}

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
