/**
 * THE HIDEOUT: BELOW THE FLOORBOARDS
 *
 * Cabin dialogue is authored as data so the runtime, tests, recording queue,
 * subtitles and mouth animation all read the same words. The Cabin owns the
 * one Margo conversation that schedules Front & Center. MARGO_CALL_READY is
 * an observational browser seam for presentation and analytics; it is not an
 * invitation for another module to ring a competing call.
 */

/* Existing Lag hint banks already live under vo.cabin.lag.  The dungeon owns
 * a narrower namespace so its synchronizer can never prune those resident
 * lines while replacing this chapter's recording rows. */
export const CABIN_VO_PREFIX = 'vo.cabin.dungeon.';

const speaker = (key, name, voice, slug) => Object.freeze({
  key, name, voice, slug,
});

export const CABIN_SPEAKERS = Object.freeze({
  TONY: speaker('TONY', 'Prospect', 'player', 'tony'),
  LOU: speaker('LOU', 'Big Uncle Lou', 'lou1', 'lou'),
  GRATIN: speaker('GRATIN', 'Gratin', 'gratin', 'gratin'),
  LAG: speaker('LAG', 'Lag', 'lag', 'lag'),
  ATEAM: speaker('ATEAM', 'A-Team Prisoner', 'ateam1', 'ateam'),
  BAITER: speaker('BAITER', 'The Baiter', 'npc-reserve-1', 'baiter'),
  APE: speaker('APE', 'Ape', 'ape', 'ape'),
  /* THE TWO VOICES THE BIBLE PUTS ON THIS PORCH.
   *
   * Beat 4 ends on the number Margo wrote down at the Bing, and beat 5 is
   * Booski about a Captain nearby. Beat 7 ends on Booski again, about Billy.
   * Neither of them is ever standing here -- they are both a phone. */
  MARGO: speaker('MARGO', 'Margo', 'margo', 'margo'),
  BOOSKI: speaker('BOOSKI', 'Booskibro', 'booski', 'booski'),
});

const line = (who, text, options = {}) => ({ who, text, ...options });
const stage = (text, options = {}) => ({ stage: text, ...options });
const action = (kind, prompt, options = {}) => ({ action: kind, prompt, ...options });

const RAW_BEATS = Object.freeze([
  {
    id: 'ARRIVAL',
    slug: 'arrival',
    title: 'Daylight at the hideout',
    lines: [
      stage('Late-morning sun over the property. The phone rings before Tony has settled in.'),
    ],
  },
  {
    id: 'FIRST_EXPLORATION',
    slug: 'explore_first',
    title: 'After the first property stop',
    lines: [
      line('TONY', "Maybe I should give that girl from the bar a call. Keep it normal for once."),
    ],
  },
  {
    id: 'RETURN_TO_CABIN',
    slug: 'return',
    title: 'Walking back after Gratin calls',
    lines: [
      line('TONY', "A basement. In the cabin. And Gratin's already in it. Course he is."),
      line('TONY', '"Follow the Supreme Leader." Right. Helpful in the way a ransom note is helpful.', { after: 0.7 }),
    ],
  },
  {
    id: 'SUPREME_LEADER_HINT',
    slug: 'supreme_hint',
    title: 'Forty-second search hint',
    lines: [
      line('TONY', "Am I a dumbass? What did he mean by Supreme Leader?"),
      line('TONY', "Cabin's full of Squatch pictures. One of them has to be the boss.", { after: 0.45 }),
    ],
  },
  {
    id: 'CELLAR_DISCOVERY',
    slug: 'cellar',
    title: 'The first concealed door',
    lines: [
      line('TONY', "There you are. Supreme Leader, secret staircase. Subtle as a brick in a sock."),
      line('GRATIN', "Keep coming. And close it behind you.", { direction: 'muffled through the floor' }),
    ],
  },
  {
    id: 'DUNGEON_DOOR',
    slug: 'dungeon_door',
    title: 'The second concealed door',
    lines: [
      line('TONY', "A secret room inside the secret room."),
      line('GRATIN', "Privacy is layers, Prospect. So is an onion. Only one makes people confess."),
      line('TONY', "Depends how hard you throw the onion."),
    ],
  },
  {
    id: 'DUNGEON_INTRO',
    slug: 'intro',
    title: 'Meet the prisoners',
    lines: [
      line('GRATIN', "There he is. Thanks for coming down. I know you were having a nice day."),
      line('TONY', "You said you needed a hand. You neglected the medieval basement."),
      line('GRATIN', "I didn't want to spoil the surprise."),
      line('GRATIN', "One of these gentlemen works for the A-Team. The other used to play Counter-Strike with Booski."),
      line('BAITER', "Used to? I still play."),
      line('GRATIN', "You held shift while Booski entered every site alone. Retirement was the kind option."),
      line('TONY', "And the rack?"),
      line('GRATIN', "He knows something about a leak. He is being shy. Pick a tool and help him find his confidence."),
    ],
  },
  {
    id: 'TOOLS',
    slug: 'tools',
    title: 'Inspect the torture table',
    lines: [
      line('GRATIN', "Pliers are personal. The battery is persuasive. Hammer is honest. Your choice."),
      line('TONY', "You alphabetize these?"),
      line('GRATIN', "Sanitize, then alphabetize. We are not animals."),
    ],
  },
  {
    id: 'BAITER_FIRST_HIT',
    slug: 'baiter_hit_one',
    title: 'The baiter starts talking',
    lines: [
      line('BAITER', "Fuck! I was holding the flank!"),
      line('GRATIN', "This guy is a bigger baiter than Ape!"),
      line('TONY', "That's a high bar and a low ceiling."),
    ],
  },
  {
    id: 'BAITER_SECOND_HIT',
    slug: 'baiter_hit_two',
    title: 'Last Alive Gamer',
    lines: [
      line('GRATIN', "Call this guy Last Alive Gamer!"),
      line('BAITER', "Please stop! I'll be First Alive Gamer next game!"),
      line('TONY', "There isn't a next game, mate. Read the room. Upside down, if you have to."),
    ],
  },
  {
    id: 'BAITER_PRESSURE',
    slug: 'baiter_pressure',
    title: 'Repeat pressure on the baiter',
    lines: [
      line('BAITER', "I threw flashes! Good flashes! Booski looked away from them!"),
      line('GRATIN', "He flashed his own team twice."),
      line('TONY', "Three times and you're legally a map feature."),
    ],
  },
  {
    id: 'ATEAM_FIRST_HIT',
    slug: 'ateam_hit_one',
    title: 'The A-Team member resists',
    lines: [
      line('ATEAM', "A-Team doesn't talk."),
      line('GRATIN', "A-Team doesn't make playoffs either. Yet here we all are."),
      line('ATEAM', "Go fuck yourself."),
      line('TONY', "Strong opening. Bad long-term strategy."),
    ],
  },
  {
    id: 'ATEAM_MID_HIT',
    slug: 'ateam_hit_mid',
    title: 'The rack tightens',
    lines: [
      line('ATEAM', "I don't know anything."),
      line('GRATIN', "Your shoulders disagree."),
      line('TONY', "They've started a separate negotiation."),
    ],
  },
  {
    id: 'ATEAM_REVEAL',
    slug: 'mole_reveal',
    title: 'The mole',
    lines: [
      line('ATEAM', "Fine! You've got a mole. Inside your crew."),
      line('GRATIN', "Name."),
      line('ATEAM', "I don't know the fucking name."),
      line('TONY', "Then give us the part you do know."),
      line('ATEAM', "I heard them say something about a Short Bus. That's it. Short Bus. That's all I know."),
      line('GRATIN', "See? Honesty. Look how much healthier he seems."),
      line('TONY', "He's on a rack, Gratin."),
      line('GRATIN', "Posture is excellent."),
    ],
  },
  {
    id: 'INTERROGATION_DONE',
    slug: 'interrogation_done',
    title: 'Gratin already has what he needs',
    lines: [
      line('GRATIN', "That's enough. Truth is mostly knowing when a lie runs out of furniture."),
      line('TONY', "You got what you needed?"),
      line('GRATIN', "I did. A little before you arrived, if we're being precise."),
      line('TONY', "Then why did I just do all that?"),
      line('GRATIN', "Bonding. Also my wrist is sore."),
    ],
  },
  {
    id: 'EXECUTION_OFFER',
    slug: 'execution_offer',
    title: 'A very polite request',
    lines: [
      stage('Gratin wipes a nine-millimeter clean, checks the chamber, and offers it grip-first.'),
      line('GRATIN', "Would you mind taking care of these two for me?"),
      line('GRATIN', "Only if it's not an inconvenience. I've got to get the fire ready, and it would mean a great deal."),
      line('TONY', "You make murder sound like helping somebody move a sofa."),
      line('GRATIN', "A sofa can't tell us there is a mole."),
      action('execution-choice', 'Take the pistol? [1] YES  [2] NO', { seconds: 10 }),
    ],
  },
  {
    id: 'EXECUTION_YES',
    slug: 'execution_yes',
    title: 'Tony accepts',
    lines: [
      line('TONY', "Yeah. I'll handle it."),
      line('GRATIN', "Thank you. Genuinely. Take your time, but not all night."),
      line('BAITER', "Wait, wait—I'll entry! Every round! No shift key!"),
      line('ATEAM', "You don't know what you're in."),
      line('TONY', "Neither do you. That's why you're furniture."),
    ],
  },
  {
    id: 'EXECUTION_NO',
    slug: 'execution_no',
    title: 'Tony refuses',
    lines: [
      line('TONY', "No. You brought them down here. You finish it."),
      line('GRATIN', "Of course. Thank you for being direct. Please step to the side."),
      line('BAITER', "No, no, he said no. That means no!"),
      line('GRATIN', "It did. To him."),
    ],
  },
  {
    id: 'EXECUTION_TIMEOUT',
    slug: 'execution_timeout',
    title: 'Tony does not decide',
    lines: [
      line('GRATIN', "No answer is an answer. That's perfectly alright."),
      line('TONY', "Gratin—"),
      line('GRATIN', "I've got it. You were kind enough to help."),
    ],
  },
  {
    id: 'GRATIN_EXECUTES',
    slug: 'gratin_executes',
    title: 'Gratin finishes the prisoners',
    lines: [
      stage('Gratin fires twice with the same calm care he used to offer the pistol.'),
      line('GRATIN', "There. Nobody had to feel awkward."),
      line('TONY', "That was your concern?"),
      line('GRATIN', "Hospitality matters."),
    ],
  },
  {
    id: 'BOTH_DEAD',
    slug: 'both_dead',
    title: 'Night falls upstairs',
    lines: [
      stage('The last shot rolls through the stone. While they are underground, daylight gives way to night.'),
      line('GRATIN', "We're done with them. We're not done with the evening."),
      line('TONY', "Please tell me the next room isn't a crematorium."),
      line('GRATIN', "Outside. Better ventilation."),
    ],
  },
  {
    id: 'WRAP_INSTRUCTIONS',
    slug: 'wrap',
    title: 'Wrap the bodies',
    lines: [
      line('GRATIN', "Canvas first. Fold from the shoulders, then the feet. Tape tight or the stairs become educational."),
      line('TONY', "You've got a system."),
      line('GRATIN', 'I learned the hard way. The labels came after the second hard way.'),
      line('TONY', "That's somehow worse than no system."),
    ],
  },
  {
    id: 'FIRST_WRAPPED',
    slug: 'wrapped_first',
    title: 'First body wrapped',
    lines: [
      line('GRATIN', "Good corners. You wrap a corpse like a man who respects luggage."),
      line('TONY', "Put that on my Christmas card."),
    ],
  },
  {
    id: 'BODIES_READY',
    slug: 'bodies_ready',
    title: 'Carry the bodies outside',
    lines: [
      line('GRATIN', 'Both wrapped. Take them through both doors, up the wardrobe ladder, and out to the fire. One at a time.'),
      line('TONY', 'So the secret murder basement has a freight policy.'),
      line('GRATIN', 'Knees, not back. I am violent, not irresponsible.'),
      line('TONY', 'That distinction is doing a lot of work tonight.'),
    ],
  },
  {
    id: 'FIRST_AT_FIRE',
    slug: 'fire_first',
    title: 'First body on the pyre',
    lines: [
      line('LAG', "Set him on the cedar. Head away from the beer."),
      line('TONY', "Important distinction."),
      line('LAG', "Only if you like the beer."),
    ],
  },
  {
    id: 'GASOLINE',
    slug: 'gasoline',
    title: 'Pour gasoline',
    lines: [
      line('GRATIN', "Even coat. No heroics. Eyebrows take months."),
      line('TONY', "You are very considerate tonight."),
      line('GRATIN', "I contain multitudes. Hold the can lower."),
    ],
  },
  {
    id: 'IGNITION',
    slug: 'ignition',
    title: 'Light the pyre',
    lines: [
      line('LAG', "There it goes."),
      line('GRATIN', "To absent friends and present problems."),
      line('TONY', "Which category were they?"),
      line('LAG', "Fuel."),
    ],
  },
  {
    id: 'FIRE_TALK_ONE',
    slug: 'fire_talk_one',
    title: 'First round by the fire',
    lines: [
      line('GRATIN', "Beer?"),
      line('TONY', "After that basement? Two."),
      line('LAG', "Cheers, Prospect."),
      action('drink-beer', 'Raise the beer and drink with them'),
      line('TONY', "Cheers. To finding rooms I didn't know existed."),
      line('GRATIN', "May they stop at two."),
    ],
  },
  {
    id: 'FIRE_TALK_SQUATCHES',
    slug: 'fire_talk_squatches',
    title: 'Ask about the Squatches',
    lines: [
      line('TONY', "Straight question. The Squatches—real, mascot, or shared head injury?"),
      line('LAG', "Real enough to ruin a quiet server."),
      line('GRATIN', "Real enough that Lou never jokes when he says the word."),
      line('TONY', "Lou jokes at funerals."),
      line('GRATIN', "Exactly."),
      line('LAG', "You hear one in the timber, don't chase it. You see one, don't run."),
      line('TONY', "What do I do?"),
      line('LAG', "Try not to look delicious."),
    ],
  },
  {
    id: 'FIRE_TALK_TWO',
    slug: 'fire_talk_two',
    title: 'Whiskey pull',
    lines: [
      line('GRATIN', "Let's do a pull. Something decent after an indecent job."),
      action('drink-whiskey', 'Take a pull of whiskey'),
      line('TONY', "Christ. That's paint remover."),
      line('LAG', "Paint had information."),
      line('GRATIN', "And now it's talking."),
      action('smoke', 'Have a cigarette by the fire', { optional: true }),
    ],
  },
  {
    id: 'FIRE_TALK_THREE',
    slug: 'fire_talk_three',
    title: 'Drunk bonding',
    lines: [
      line('TONY', "Did Lou build the dungeon before or after the nice curtains?"),
      line('GRATIN', "Same contractor. Very discreet. Terrible invoices."),
      line('LAG', "You did alright tonight."),
      line('TONY', "I carried two men to a fire."),
      line('LAG', "Didn't drop either."),
      line('GRATIN', "Growth is measurable."),
      line('TONY', "I'm putting both of you on my résumé."),
    ],
  },
  {
    id: 'BLACKOUT',
    slug: 'blackout',
    title: 'The fire eats the rest of the night',
    lines: [
      line('GRATIN', "One last pull."),
      action('drink-whiskey', 'Take one last pull'),
      line('TONY', "Last one. Definitely."),
      line('LAG', "That's what makes it the last one."),
      stage('The fire doubles, voices smear into laughter, and the treeline folds into black.'),
    ],
  },
  {
    id: 'MORNING',
    slug: 'morning',
    title: 'Morning in the cabin bed',
    lines: [
      line('TONY', "No headache. Either that whiskey was good or Gratin drugged the water."),
      line('TONY', "Clean shirt, find the phone, never inspect the ashes. Morning."),
    ],
  },
]);

function compileBeat(raw) {
  const counts = new Map();
  const lines = raw.lines.map((entry) => {
    if (!entry.who) return Object.freeze({ ...entry });
    const who = CABIN_SPEAKERS[entry.who];
    if (!who) throw new Error('Unknown Cabin speaker ' + entry.who + ' in ' + raw.id);
    const next = (counts.get(who.slug) || 0) + 1;
    counts.set(who.slug, next);
    const cue = entry.cue || CABIN_VO_PREFIX + raw.slug + '.' + who.slug + '.' + next;
    return Object.freeze({ ...entry, cue, speaker: who });
  });
  return Object.freeze({ ...raw, lines: Object.freeze(lines) });
}

export const CABIN_BEATS = Object.freeze(RAW_BEATS.map(compileBeat));
const BEAT_BY_ID = new Map(CABIN_BEATS.map((entry) => [entry.id, entry]));

export function cabinBeat(id) {
  return BEAT_BY_ID.get(id) || null;
}

export function cabinDialogueLines(id) {
  return (cabinBeat(id)?.lines || []).filter((entry) => entry.cue);
}

export function cabinBeatActions(id) {
  return (cabinBeat(id)?.lines || []).filter((entry) => entry.action || entry.stage);
}

const phoneCall = (id, from, caller, vo, lines, replies, { outgoing = false } = {}) => Object.freeze({
  id, from, caller, vo, allowHangup: false, outgoing,
  lines: Object.freeze(lines),
  replies: Object.freeze(replies),
});

export const CABIN_PHONE_CALLS = Object.freeze({
  LOU_ARRIVAL: phoneCall(
    'cabin.lou.arrival',
    'BIG UNCLE LOU',
    CABIN_SPEAKERS.LOU,
    'call.lou.cabin_lay_low',
    [
      "Tony. You did what was asked and you didn't make a mess of it. That gets noticed.",
      "Now you're nowhere. No city, no visitors, no hero shit. A man who just did what you did does not get seen for a while.",
      "Lag keeps the place. He knows you're coming. Walk the property, clear your head, answer your phone.",
    ],
    [
      "Thanks, Lou. How long is a while?",
      "Nowhere I can do. No promises on the hero shit.",
      "Understood. Cabin, fresh air, absolutely normal week.",
    ],
  ),
  /**
   * BEAT 4'S LAST THING. The only call at this cabin he makes, and the only
   * player-facing conversation that schedules Front & Center.
   *
   * She wrote the number on the back of something at the Bing and he has been
   * carrying it since. He rings it standing on a porch two hours out of the
   * city, the morning after the first man he ever killed, and neither of them
   * says a word about any of that. Play it straight: two adults make a plan,
   * quickly, and neither turns it into a speech.
   */
  MARGO_FIRST_CALL: phoneCall(
    'cabin.margo.first_call',
    'MARGO',
    CABIN_SPEAKERS.MARGO,
    'call.margo.cabin_date',
    [
      'Tony. I was starting to think the number was decorative.',
      'Front & Center. Ask for the Silver Room. Nine o’clock. If you’re late, I eat without you.',
      'Good. Rye, one cube. And wear something that has met an iron.',
    ],
    [
      'Hello? Tony. From the Bing.',
      'Work dragged me out of town. I’m calling before the trees learn my name.',
      'Front & Center. Silver Room. Nine. I won’t waste it.',
    ],
    { outgoing: true },
  ),
  /**
   * BEAT 5. Booski about the Captain, which is the Beef Run.
   *
   * The Family does not explain itself to a prospect. He is told there is a
   * man, and a plane, and that he is close enough to be useful -- and the
   * useful part is the compliment.
   */
  BOOSKI_SASOLE: phoneCall(
    'cabin.booski.sasole',
    'BOOSKIBRO',
    CABIN_SPEAKERS.BOOSKI,
    'call.booski.cabin_sasole',
    [
      "Prospect. You're up at the property. Good. There's a strip forty minutes from you.",
      "Captain Sasole. He flies for us and he needs a second pair of hands today.",
      "You're not being asked to fly it. You're being asked to be there.",
      "Go now. Lag will point you at the road.",
    ],
    [
      "I'm here. Lou said quiet.",
      "Sasole. Do I know what I'm carrying?",
      "That I can do.",
      "On my way.",
    ],
  ),
  /**
   * BEAT 7'S LAST THING, and the end of this cabin. Booski about Billy.
   *
   * Two men went on the fire last night and nobody mentions it. That is the
   * joke, and the joke only works if it is never pointed at.
   */
  BOOSKI_BILLY: phoneCall(
    'cabin.booski.billy',
    'BOOSKIBRO',
    CABIN_SPEAKERS.BOOSKI,
    'call.booski.cabin_billy',
    [
      "You awake? Good. You're done up there. Come back.",
      "Billy Hotdog is getting out this afternoon. The Bing is doing something about it tonight.",
      "Everyone will be there. That includes you now.",
      "Car's out front. Clean shirt, no questions. Don't stop anywhere.",
    ],
    [
      "Awake enough. Done. Understood.",
      "Billy's out. That's good news.",
      "I'll be there.",
      "Clean shirt. No stops. I got it.",
    ],
  ),
  GRATIN_BASEMENT: phoneCall(
    'cabin.gratin.basement',
    'GRATIN',
    CABIN_SPEAKERS.GRATIN,
    'call.gratin.cabin_basement',
    [
      "Prospect. I'm in the basement at the cabin. I need a hand.",
      "Basement.",
      "Follow the Supreme Leader. You'll find it.",
      "Bring yourself. Tools are provided.",
    ],
    [
      "You're where?",
      "Wait—there's a basement in the cabin, and you're in it?",
      "That sentence helped less than you think.",
      "Right. Completely normal phone call. On my way.",
    ],
  ),
  /* Legacy post-heist saves can still owe this call. Fresh Act One never rings
   * it: Booski's Billy call now owns the whole canonical morning handoff. */
  APE_MORNING: phoneCall(
    'cabin.ape.morning',
    'APE',
    CABIN_SPEAKERS.APE,
    'call.ape.cabin_morning',
    [
      "You awake?",
      "Car's out front. Lou says bring a clean shirt and don't ask me where we're going.",
      "And don't eat anything Lag cooked in foil. That's separate advice.",
    ],
    [
      "Define awake.",
      "Clean shirt, no questions. That's becoming a uniform.",
      "Too late to be useful, but appreciated.",
    ],
  ),
});

export const MARGO_CALL_READY = Object.freeze({
  eventName: 'squatch:cabin-margo-call-ready',
  afterExplorationCount: 1,
  note: 'Observational seam before the Cabin-owned objective; Tony initiates the outgoing call from the held phone.',
  setupBeat: 'FIRST_EXPLORATION',
});

function phoneCues(call) {
  const cues = [];
  for (let index = 0; index < call.lines.length; index += 1) {
    cues.push(Object.freeze({
      name: 'vo.' + call.vo + '.' + (index + 1),
      voice: call.caller.voice,
      say: call.lines[index],
      beat: call.id,
      speaker: call.caller.key,
    }));
    if (call.replies[index]) {
      cues.push(Object.freeze({
        name: 'vo.' + call.vo + '.tony.' + (index + 1),
        voice: CABIN_SPEAKERS.TONY.voice,
        say: call.replies[index],
        beat: call.id,
        speaker: 'TONY',
      }));
    }
  }
  return cues;
}

export function cabinScriptCues() {
  const cues = [];
  for (const beat of CABIN_BEATS) {
    for (const entry of beat.lines) {
      if (!entry.cue) continue;
      cues.push(Object.freeze({
        name: entry.cue,
        voice: entry.speaker.voice,
        say: entry.text,
        beat: beat.id,
        speaker: entry.who,
      }));
    }
  }
  for (const call of Object.values(CABIN_PHONE_CALLS)) cues.push(...phoneCues(call));
  return Object.freeze(cues);
}

export const CABIN_REQUIRED_LINES = Object.freeze({
  biggerBaiter: 'This guy is a bigger baiter than Ape!',
  lastAlive: 'Call this guy Last Alive Gamer!',
  firstAlive: "Please stop! I'll be First Alive Gamer next game!",
  shortBus: "I heard them say something about a Short Bus. That's it. Short Bus. That's all I know.",
  politeRequest: 'Would you mind taking care of these two for me?',
  supremeLeader: "Follow the Supreme Leader. You'll find it.",
  dumbassHint: 'Am I a dumbass? What did he mean by Supreme Leader?',
});
