/**
 * What is on the radio.
 *
 * Three stations. 97.8 THE SQUATCH is talk radio, and what is on depends on
 * the in-game hour -- the schedule below is the one the station advertises,
 * and it keeps to it. The other two are music, and each has its own playlist:
 * tracks in assets/music/manifest.json name the station they belong to.
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

/**
 * The community notice. 97.8 reads it out every so often because the station
 * and the meeting share about nine people, and it is the third way the game
 * will tell you where you are supposed to be tomorrow night -- after the note
 * on the corkboard and the messages on the second monitor. If you have the
 * radio on at all, you cannot really miss it, which is the point: the game
 * never gates on you having found something.
 *
 * Segments tagged `notice: true` mark you as knowing about the meeting.
 */
export const MEETING_NOTICE = [
  { line: 'ANNOUNCER: Community notice, and we read this one properly.', cue: 'radio.jingle', notice: true },
  { line: 'ANNOUNCER: The Squatch Meeting is Wednesday. Tomorrow. Seven in the evening.', notice: true },
  { line: 'ANNOUNCER: Same room as always. Doors at half six. Do not turn up at half seven.', notice: true },
  { line: 'ANNOUNCER: Somebody always turns up at half seven.', notice: true },
  { line: 'ANNOUNCER: Come showered. Come dressed. Come having eaten something.', notice: true },
  { line: 'ANNOUNCER: That is not us being rude, that is a direct request from the room.', notice: true },
  { line: 'ANNOUNCER: If you are new: it is not that kind of meeting. Bring nothing. Turn up.', notice: true },
  { line: 'ANNOUNCER: Wednesday. Seven. 97.8 The Squatch, reminding you where to be.', notice: true },
];

/** How many ordinary segments air between readings of the notice. */
export const NOTICE_EVERY = 11;

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
        "LOU: Somebody has a meeting tomorrow night and has told everyone about it twice.",
        "LOU: That is not a bit. Somebody genuinely rang in about that.",
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
        "APE: Somebody has written in about tomorrow night. Big meeting. Big turnout expected.",
      ],
      [
        "APE: You know the one. Wednesday. Seven o\u2019clock. Do not be the one who forgets.",
      ],
      [
        "APE: I say that every week and every week somebody forgets.",
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
      [
        "HOG MAMA: There is a man in the apartment and he has somewhere to be tomorrow.",
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
    commercial: COMMERCIAL,
    /** Exchanges between airings of the commercial. */
    commercialEvery: 6,
    /** Exchanges between records. Every other block is music. */
    songEvery: 2,
    /** This station reads the community notice. */
    notices: true,
    /**
     * Blocks that must air before the notice can. Waking up to a man reading
     * out where you are supposed to be tomorrow is the game telling you its
     * goal in the first ten seconds; letting the station be a station for a
     * while first means you find it rather than are handed it.
     */
    noticeAfter: 5,
    /** Exchanges between repeats of the notice, once it has started. */
    noticeEvery: 9,
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
      'This one was recorded the night before somebody had somewhere to be.',
      'Turn it up. Nobody in this building is going to stop you.',
      '97.8 The Squatch. The roster, on the roster.',
    ],
    /** Shown when the player has not supplied any music yet. */
    empty: [
      '97.8 The Squatch. We would play you a record, but there are no records.',
      'Drop some MP3s into assets/music/ and list them in manifest.json.',
      'Until then: this. This is the show now.',
    ],
  },
];

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
    for (const seg of st.commercial ?? []) add(seg.line, 'announcer');
    if (st.notices) for (const seg of MEETING_NOTICE) add(seg.line, 'announcer');
    for (const line of st.lines ?? []) add(line, 'announcer');
    for (const line of st.empty ?? []) add(line, 'announcer');
  }
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
