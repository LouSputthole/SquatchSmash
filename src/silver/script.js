/**
 * Everything anybody says in the Silver Room.
 *
 * Same arrangement as the Bing: this file is the script, dialogue.js is the
 * machine that plays it, and neither knows much about the other. Nodes read the
 * mission and the Woo ledger, so a man who left her in the cellar gets a
 * different kitchen from a man who did not.
 *
 * Nothing in here is labelled good or bad. The tone tags are what the line is,
 * not what it is worth — "Honest" is not a recommendation. The player is meant
 * to work it out by listening to her, which is the entire minigame.
 */
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';


/**
 * Who she is, in one place, because six systems need bits of her.
 *
 * The identifier is `DATE` rather than her name on purpose. She has been
 * recast once already — the first pass made her a host on 97.8, which put her
 * on the family's own radio station and therefore inside the family, and you
 * do not take the family on a date. The whole point of her is that she is a
 * civilian: the one person in the mission with no stake in any of it, whose
 * good opinion therefore costs something to earn.
 *
 * So the name lives in the data and nowhere else, and recasting her again is
 * editing this object — except for the name itself, which now comes from the
 * campaign character registry, because she is a campaign character: the
 * apartment phone rings in her name the afternoon before this scene, and the
 * two must not be able to disagree about what she is called.
 */
const REGISTERED = getCharacter(CHARACTER_IDS.MARGO);

export const DATE = {
  name: REGISTERED.subtitleName,
  full: REGISTERED.canonicalName,
  /** What she does, which is most of why she is the right person for this. */
  job: 'runs the kitchen at the Blue Hour, a twenty-four-hour place on Ashland',
  /* She is the only guest in the building who can read the back of house
   * professionally. Everything Prospect is showing off — the door that opens,
   * the chef who puts down a pan, the table that appears — she can price
   * exactly, which makes her both much harder to impress and much more
   * impressed when it lands. */
  drink: 'rye, one ice cube',
  drinkId: 'rye',
  music: 'a live horn section',
  /** Why she came. */
  interest: 'he came in at four in the morning, ordered without reading the '
    + 'menu, complained about nothing, and tipped her dishwasher',
  /** Why she is not sold. */
  doubt: 'fifteen years of men performing competence in kitchens',
  /** The thing you remember about her. */
  detail: 'a burn up the inside of her right forearm, and she will tell you '
    + 'exactly which pan and exactly whose fault',
  /** Things the player can call her. Only one of these is her name. */
  names: {
    right: REGISTERED.subtitleName,
    /* Her own kitchen calls her this and it is not a compliment in a dining
     * room: it introduces her as a job rather than as a person. */
    job: 'Chef',
    wrong: 'Marissa',
  },
};

/**
 * Whose voice a subtitle is in.
 *
 * The `who` on a node is what the player reads; this is what gets recorded.
 * A speaker who is not in here has no cue, plays no audio, and is subtitled
 * exactly as before — which is the right answer for the driver, the doorman
 * and the chef, none of whom have been cast. The four men on the floor share
 * one profile because the owner's sheet has one row for wait staff; they are
 * still four separate banks of cues, so recasting any of them is a voice id
 * and nothing else.
 *
 * Exported because the manifest is authored from it and the verifier holds
 * the two in step.
 */
export const VOICE_OF = {
  [DATE.name]: 'margo',
  Prospect: 'player',
  'the host': 'host',
  'the manager': 'manager',
  'the waiter': 'waiter',
  'the bandleader': 'bandleader',
  Ape: 'ape',
  'the driver': 'driver',
  Vinny: 'vinny',
  'the cellarman': 'cellarman',
  'the porter': 'porter',
  Chef: 'chef',
  'a cook': 'cook',
  'the dishwasher': 'dishwasher',
  'the service bar': 'servicebar',
  'coat check': 'coatcheck',
  'the photographer': 'photographer',
  'the announcer': 'announcer',
};

/**
 * Which recorded voice each of those banks is actually made in.
 *
 * Two different things, deliberately. The bank is who is speaking and names
 * the cue; the profile is whose larynx it comes out of and is what the
 * generator sends to ElevenLabs. The four men working the room share one
 * profile because the owner's sheet has one row for wait staff — and keeping
 * the banks separate anyway is what makes recasting any one of them a line in
 * the manifest rather than a rename across ninety cues.
 */
export const PROFILE_OF = {
  margo: 'margo',
  player: 'player',
  ape: 'ape',
  host: 'waiter',
  // Recast after playtest: a distinct voice, not another waiter.
  // Owner-cast 2026-08-04, split off the shared npc-male id.
  manager: 'manager',
  waiter: 'silver-waiter',
  bandleader: 'waiter',
  driver: 'doorman',
  vinny: 'doorman',
  cellarman: 'waiter',
  porter: 'waiter',
  chef: 'waiter',
  cook: 'waiter',
  dishwasher: 'waiter',
  servicebar: 'waiter',
  coatcheck: 'waiter',
  photographer: 'waiter',
  announcer: 'announcer',
  /** The building overheard: "a cook", "the pass", "a porter". */
  room: 'waiter',
};

function silverCueWords(value) {
  return String(value ?? '')
    .replace(/<em>\s*\([^)]*\)\s*<\/em>/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    // A spoken dash on each side of an inline stage direction becomes one
    // natural pause after the direction is removed, not "— —" in the take.
    .replace(/([—–-])\s+[—–-]\s+/g, '$1 ')
    .trim()
    .replace(/^[—–-]\s*/, '')
    .trim();
}

export function silverSpokenWords(value) {
  return silverCueWords(value)
    .replace(/(?:\s*[—–]\s*){2,}/g, ' — ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function silverTextHash(value) {
  let hash = 2166136261;
  /* Direction cleanup changes actor copy, not stable filenames for takes
   * already delivered against the same authored display line. */
  for (const ch of silverCueWords(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stamp `vo.silver.<who>.<tree>.<node>` onto every line somebody cast can say.
 *
 * Names come from the node's own id rather than from a running number, so
 * moving a node up the file does not silently hand its recording to its
 * neighbour — the failure mode the Beef Run needs a regeneration script to
 * stay ahead of. A node whose line depends on the evening carries `variant()`
 * alongside it, returning a tag for whichever thing it is about to say, and
 * gets one cue per tag. Both are read by `tools/verify-silver.mjs`, which
 * walks the built trees under every branch and requires that the manifest
 * says exactly what the subtitle says.
 *
 * @param {string} tree the tree's own name, because node ids repeat across
 *   trees and `open` is six different sentences.
 */
function voiced(tree, nodes) {
  for (const [id, node] of Object.entries(nodes)) {
    const voice = VOICE_OF[node?.who];
    if (voice && node.line) {
    /* The tree's name is dropped when it is already the speaker's, so the
     * host's own tree is `vo.silver.host.open` and Margo's line in it, if
     * she ever gets one, is `vo.silver.margo.host.open`. */
      const base = `vo.silver.${voice}.${tree === voice ? '' : `${tree}.`}${id}`;
      const cue = () => {
        const line = typeof node.line === 'function' ? node.line() : node.line;
        if (!/[\p{L}\p{N}]/u.test(silverSpokenWords(line))) return null;
        if (node.variant) return `${base}.${node.variant()}`;
        return typeof node.line === 'function' ? `${base}.${silverTextHash(line)}` : base;
      };
      node.cue = (node.variant || typeof node.line === 'function') ? cue : cue();
    }

    const decorate = (options) => (options || []).map((option) => {
      if (!option?.text || option.cue) return option;
      const cue = () => {
        const text = typeof option.text === 'function' ? option.text() : option.text;
        const words = silverSpokenWords(text);
        return /[\p{L}\p{N}]/u.test(words)
          ? `vo.silver.player.${tree}.${id}.${silverTextHash(words)}`
          : null;
      };
      return { ...option, cue: typeof option.text === 'function' ? cue : cue() };
    });
    if (typeof node?.options === 'function') {
      const options = node.options;
      node.options = (...args) => decorate(options(...args));
    } else if (node?.options) node.options = decorate(node.options);
  }
  return nodes;
}

/** The same, for the cutscene timelines, which are arrays and change speaker. */
function voicedScene(name, beats) {
  beats.forEach((beat, i) => {
    const voice = VOICE_OF[beat.who];
    if (voice && beat.line) beat.cue = `vo.silver.${voice}.${name}.${i}`;
  });
  return beats;
}

/**
 * @param {object} ctx {
 *   mission, flags, woo, fire(id, amt), tip(id, amount), money(),
 *   drunkLevel(), knows(id), remember(id)
 * }
 */
export function buildScripts(ctx) {
  const { mission, flags, woo } = ctx;
  const fire = ctx.fire;

  /* A tip option, everywhere. The interaction system offers the greeting on a
   * tap and this on a hold, so it is one target and two actions rather than a
   * menu — but the conversations also carry it, for the people you end up
   * talking to properly. */
  const tipOption = (id, amount, text, next) => ({
    tone: `$${amount}`,
    text,
    when: () => ctx.money() >= amount && !woo.has(id),
    next,
    effect: () => ctx.tip(id, amount),
  });

  /* ---------------------------------------------------------------- */
  /* The car                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * A hired car and a man who has never seen either of them before.
   *
   * He is the only person tonight who does not know who Prospect is, and the
   * only one who says thank you out loud for money. Both of those are doing
   * the same job: giving the next thirty minutes something to be different
   * from. Everybody inside takes a folded note without acknowledging it, and
   * that reads as remarkable only if you have just watched somebody do it the
   * normal way.
   *
   * So he is short, faintly aggrieved, and gone as soon as the pavement is
   * done with him — he does not pull off mid-sentence, and he does not leave
   * on a hidden clock while you are still reading her.
   */
  const driver = {
    open: {
      who: 'the driver',
      line: 'This is you. <em>(He is already looking at the mirror rather than at either of '
        + 'them.)</em> I’m not stopping here, they tow on this block for looking at the kerb '
        + 'wrong.',
      options: () => [
        tipOption('Woo.DriverTipped', 40, 'Keep it. All of it.', 'tipped'),
        /* Over the odds, on purpose, in front of her. The only elective
         * generosity in the mission — everything else on the route has one
         * price, and `Woo.GenerousTip` had nothing at all that could fire it.
         * It lands on the one man tonight who will say thank you out loud. */
        { tone: '$80', text: 'Take double. Nobody drove me here.',
          when: () => ctx.money() >= 80 && !woo.has('Woo.DriverTipped'),
          next: 'tipped',
          effect: () => ctx.tip('Woo.DriverTipped', 80, { generous: true }) },
        { tone: 'Ask', text: 'You know this place?', next: 'know' },
        { tone: 'Go', text: 'Thanks. We’re good.', next: null },
      ],
    },
    tipped: {
      who: 'the driver',
      line: '<em>(He counts it. He actually counts it, in front of you, and then he turns '
        + 'round in the seat.)</em> …That’s — thank you. Seriously. Thank you. Have a lovely '
        + 'evening, both of you.',
      hold: 4.4,
      next: 'off',
    },
    know: {
      who: 'the driver',
      line: 'I know the queue. I sit in it twice a night waiting for people who have given '
        + 'up. <em>(Beat.)</em> Never been in.',
      next: 'off',
    },
    off: {
      who: '',
      line: '<em>(And he pulls out, and that is the last person this evening who will have '
        + 'no idea who you are.)</em>',
      hold: 4.0,
    },
  };

  /* ---------------------------------------------------------------- */
  /* Her, on the pavement                                              */
  /* ---------------------------------------------------------------- */

  /**
   * This tree IS the board's "tell her why you are not using the front door".
   *
   * It always was — her opening line is the question and three of the four
   * replies are answers to it — but nothing anywhere in the mission ever set
   * `flags.askedAboutFront`, so the objective could not be completed by
   * answering her, or by anything else. It was the one line on the board with
   * no way to cross it off, which is exactly the report: "I'm not sure how to
   * tell her I am not using the front door."
   *
   * Answering is answering, whichever of the three he picks and however badly
   * it goes — `owes` is a fumble and still scores the objective, because the
   * objective is telling her, and Woo already has an opinion about how. Saying
   * nothing is the one option that does not count, on purpose: it is the
   * choice to not tell her, and it is written as one.
   */
  const arrival = {
    open: {
      who: DATE.name,
      line: 'The entrance is back there. There’s a rope and everything. There’s a man with a '
        + 'clipboard, which I always think is a bit much for a supper club.',
      options: [
        { tone: 'Flat', text: 'The front’s for people waiting to get noticed.',
          next: 'noticed',
          effect: () => { flags.askedAboutFront = true; fire('Woo.SideDoorResponse'); } },
        { tone: 'Simple', text: 'I like going this way.',
          next: 'this-way',
          effect: () => { flags.askedAboutFront = true; fire('Woo.SideDoorResponse'); } },
        { tone: 'Name-drop', text: 'The guy on the door still owes Big Uncle Lou money.',
          next: 'owes',
          effect: () => { flags.askedAboutFront = true; fire('Woo.SideDoorFumbled'); } },
        { tone: 'Nothing', text: '<em>(Just walk towards the alley.)</em>', next: 'nothing' },
      ],
    },
    noticed: {
      who: DATE.name,
      line: '<em>(A beat.)</em> That was rehearsed.',
      options: [
        { tone: 'Admit it', text: 'In the car. Twice.', next: 'admitted',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'Deny it', text: 'That was off the top of my head.', next: 'denied' },
      ],
    },
    admitted: {
      who: DATE.name,
      line: 'See, that I like. Everybody in this city has a line. Almost nobody will '
        + 'tell you where they got it.',
      hold: 3.6,
      next: 'lead',
    },
    denied: {
      who: DATE.name,
      line: 'Fifteen years of men telling me the fish is fine. I can hear a '
        + 'rehearsal. <em>(She is not annoyed. She is filing it.)</em>',
      hold: 3.8,
      next: 'lead',
    },
    'this-way': {
      who: DATE.name,
      line: 'You like going this way. <em>(She looks at the alley, then at her shoes, '
        + 'then at you.)</em> Alright. These were expensive and I don’t care.',
      hold: 4.0,
      next: 'lead',
    },
    owes: {
      who: DATE.name,
      line: 'So we’re going round the back because a man owes money. That’s not a reason, '
        + 'that’s an admission.',
      hold: 3.6,
      next: 'lead',
    },
    nothing: {
      who: DATE.name,
      line: '<em>(She follows.)</em> No answer. Bold. Silence is a choice, and it’s usually '
        + 'the wrong one, and here we are.',
      hold: 4.0,
      next: 'lead',
    },
    lead: {
      who: DATE.name,
      line: '<em>(Watching the car go.)</em> He had no idea who you were. '
        + '<em>(She turns round.)</em> Let’s find out if anybody else does. Go on. Lead.',
      enter: () => mission.addObjective('alley', 'Take her round the side'),
      hold: 2.2,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The route                                                         */
  /* ---------------------------------------------------------------- */

  const doorman = {
    open: {
      who: 'Vinny',
      line: () => (flags.driverTipped
        ? 'Prospect. <em>(He is already pulling the door.)</em> They said tonight or tomorrow. '
          + 'It’s tonight.'
        : 'Prospect. <em>(He opens it without asking anything.)</em> Straight through, mind the '
          + 'step, it’s wet on the second one.'),
      options: () => [
        tipOption('Woo.DoorAttendantTipped', 20, '<em>(Fold it into the handshake.)</em>', 'took'),
        { tone: 'Greet', text: 'Vinny. How’s the knee?', next: 'knee' },
        { tone: 'Go in', text: '<em>(Go in.)</em>', next: null },
      ],
    },
    took: {
      who: 'Vinny',
      line: '<em>(It is gone before you have finished the shake.)</em> Have a good night. '
        + 'Ma’am, watch the second step, he never says it in time.',
      hold: 3.6,
    },
    knee: {
      who: 'Vinny',
      line: 'The knee’s the knee. The doctor says stand less. I stand for a living. '
        + 'We agreed to disagree.',
      hold: 3.4,
    },
  };

  const cellarman = {
    open: {
      who: 'the cellarman',
      line: 'Don’t touch the crate by the wall, that’s spoken for, and it’s spoken for by '
        + 'somebody who counts.',
      options: () => [
        tipOption('Woo.CellarWorkerTipped', 20, '<em>(Hand him something.)</em>', 'took'),
        { tone: 'Ask', text: 'Spoken for by who?', next: 'who' },
        { tone: 'Move on', text: 'Wasn’t going to.', next: null },
      ],
    },
    took: {
      who: 'the cellarman',
      line: 'Appreciated. There’s a case of the good rye behind the stair if the floor '
        + 'gives you the cheap one. Tell them Marco said.',
      enter: () => ctx.remember('rye-tip'),
      hold: 4.0,
    },
    who: {
      who: 'the cellarman',
      line: 'By somebody who counts. That’s the whole sentence. That’s all of it.',
      /* Talking to the back of house because they are worth talking to, which
       * is what `Woo.CellarBanter` was for. It had a value and no caller. */
      enter: () => fire('Woo.CellarBanter'),
      hold: 3.0,
    },
  };

  const delivery = {
    open: {
      who: 'the driver',
      line: '<em>(Half under a stack of crates.)</em> Twelve cases, they signed for nine, '
        + 'and now it’s my evening. Coming through — coming through —',
      options: () => [
        tipOption('Woo.DeliveryTipped', 20, 'For the paperwork.', 'took'),
        { tone: 'Move', text: '<em>(Get her out of the way.)</em>', next: 'space',
          effect: () => fire('Woo.HazardGuided') },
        { tone: 'Nothing', text: '<em>(Squeeze past.)</em>', next: null },
      ],
    },
    took: {
      who: 'the driver',
      line: 'You don’t even work here. <em>(He takes it.)</em> You don’t even work here.',
      hold: 3.2,
    },
    space: {
      who: 'the driver',
      line: 'Thank you. Thank you. Somebody in this building has a mother.',
      hold: 3.0,
    },
  };

  const porter = {
    open: {
      who: 'the porter',
      line: 'Mind your back, mind your back — <em>(a rack of glasses goes past at speed)</em> — '
        + 'sorry, ma’am, that’s two hundred glasses and I’m the only reason they’re alive.',
      options: () => [
        tipOption('Woo.PorterTipped', 20, '<em>(Slip it to him.)</em>', 'took'),
        { tone: 'Dry', text: 'Long night?', next: 'long' },
        { tone: 'Move on', text: '<em>(Let him past.)</em>', next: null },
      ],
    },
    took: {
      who: 'the porter',
      line: 'Oh — right. <em>(He has nowhere to put it and puts it in his sock.)</em> '
        + 'Don’t look at me. It’s the only pocket that isn’t wet.',
      hold: 4.0,
    },
    long: {
      who: 'the porter',
      line: 'It started long. It’s gone past long. We’re into a new unit.',
      enter: () => fire('Woo.KitchenBanter'),
      hold: 3.0,
    },
  };

  const chef = {
    open: {
      who: 'Chef',
      line: () => (woo.score >= 30
        ? '<em>(He puts the pan down. The whole line notices him put the pan down.)</em> '
          + 'Prospect. Through. Go on, through — Marco, hold the pass —'
        : '<em>(Without looking up.)</em> Whoever that is, they’re in my line. '
          + '<em>(He looks up.)</em> …Ah. Through you go.'),
      options: () => [
        tipOption('Woo.CookTipped', 50, '<em>(Into the apron pocket.)</em>', 'took'),
        { tone: 'Respect', text: 'Chef. Sorry. We’ll be out of it.', next: 'respect' },
        { tone: 'Cocky', text: 'Smells better than the dining room.', next: 'cocky' },
        { tone: 'Push past', text: '<em>(Just go through.)</em>', next: null },
      ],
    },
    took: {
      who: 'Chef',
      line: '<em>(He does not look at it. It disappears anyway.)</em> Ma’am. He comes in '
        + 'through my kitchen like he owns the sauce. He does not own the sauce. '
        + 'Enjoy your evening.',
      hold: 5.0,
    },
    respect: {
      who: 'Chef',
      line: 'You’re alright. Two seconds — <em>(to the line)</em> — heard! — go on, go, '
        + 'before somebody plates you.',
      enter: () => fire('Woo.KitchenBanter'),
      hold: 4.0,
    },
    cocky: {
      who: 'Chef',
      line: 'Everything smells better than the dining room. The dining room smells of '
        + 'cologne and men lying about property.',
      enter: () => fire('Woo.KitchenBanter'),
      hold: 4.2,
    },
  };

  /**
   * The man with the pan.
   *
   * He is the one hazard on the route and he was the only person on it you
   * could not hand anything to, which meant the best beat in the kitchen — put
   * a hand out to keep her clear of him, then look after him for it — had
   * nowhere to land. Tipping him inside a few seconds of that is what the
   * contextual bonus is for.
   */
  const linecook = {
    open: {
      who: 'a cook',
      line: () => (flags.hazardSeen
        ? '<em>(He has the pan in both hands and both elbows out, and he has clocked that '
          + 'somebody moved for him.)</em> Behind — thank you, behind —'
        : '<em>(Coming through the middle of the route at speed with something that is '
          + 'still cooking.)</em> Behind! Behind, behind, behind —'),
      options: () => [
        tipOption('Woo.LineCookTipped', 20, '<em>(Into the apron, while his hands are full.)</em>', 'took'),
        { tone: 'Move', text: '<em>(Get her out of his line.)</em>', next: 'space',
          effect: () => fire('Woo.HazardGuided') },
        { tone: 'Nothing', text: '<em>(Flatten against the bench.)</em>', next: null },
      ],
    },
    took: {
      who: 'a cook',
      line: '<em>(He cannot take it and does not stop walking, so it goes in the apron '
        + 'pocket and he says the rest of it over his shoulder.)</em> That’s a first. '
        + 'Ma’am — mind the floor by the pass, it’s the only bit that’s wet.',
      hold: 4.6,
    },
    space: {
      who: 'a cook',
      line: 'Thank you. <em>(To her, still moving.)</em> Nobody moves. Twenty years, '
        + 'nobody moves.',
      hold: 3.6,
    },
  };

  const dishwasher = {
    open: {
      who: 'the dishwasher',
      line: '<em>(Over the spray, cheerfully, to nobody.)</em> They sat nine at a six. '
        + 'Nine at a six. And I’m the problem.',
      options: () => [
        tipOption('Woo.DishwasherTipped', 20, '<em>(Put it on the dry end.)</em>', 'took'),
        { tone: 'Agree', text: 'You’re not the problem.', next: 'agree' },
        /* The one line in the mission that is beneath him. It is here, in the
         * dish room, in front of her, because this is the man nobody tips and
         * she is watching how he speaks to the people who cannot answer back. */
        { tone: 'Dismiss', text: 'Nobody asked you. Do the plates.', next: 'beneath',
          effect: () => fire('Woo.WorkerInsulted') },
        { tone: 'Move on', text: '<em>(Keep going.)</em>', next: null },
      ],
    },
    beneath: {
      who: DATE.name,
      line: '<em>(The spray keeps going. Nobody in the room looks up, which is how you '
        + 'know all of them heard it. She waits until you are three steps past him.)</em> '
        + 'Do the plates. <em>(Not a question. Just handing it back to you.)</em>',
      hold: 5.2,
    },
    took: {
      who: 'the dishwasher',
      line: '<em>(He wipes his hand on his chest before he takes it, which takes a while, '
        + 'and nobody rushes him.)</em> God bless. Watch the floor there, that’s the wet bit.',
      hold: 4.4,
    },
    agree: {
      who: 'the dishwasher',
      line: 'THANK you. <em>(To the whole room.)</em> HE says I’m not the problem.',
      hold: 3.2,
    },
  };

  const servicebar = {
    open: {
      who: 'the service bar',
      line: 'Six on the tray, four of them on fire, and the floor wants another eleven. '
        + 'You want something or you want to stand there?',
      options: () => [
        tipOption('Woo.ServiceBarTipped', 20, '<em>(On the rail.)</em>', 'took'),
        { tone: 'Ask', text: 'What’s the rye like?', next: 'rye' },
        { tone: 'Move on', text: 'We’re fine.', next: null },
      ],
    },
    took: {
      who: 'the service bar',
      line: 'Ohh. <em>(It goes under the rail into a tin, and the tin sounds full.)</em> '
        + 'Whatever you sit at, it comes fast. That’s the arrangement now.',
      hold: 4.2,
    },
    rye: {
      who: 'the service bar',
      line: 'The rye’s the one thing in here that isn’t a lie. Whatever they tell you '
        + 'about the veal, the rye’s honest.',
      enter: () => ctx.remember('rye-tip'),
      hold: 4.0,
    },
  };

  const coatcheck = {
    open: {
      who: 'coat check',
      line: () => (flags.abandonments > 1
        ? 'Two, is it? <em>(She looks past you at Margo, who has just caught up.)</em> …Two.'
        : 'Evening. Coats? <em>(To Margo.)</em> That’s a good coat. That’s a coat somebody chose.'),
      options: () => [
        { tone: 'Both', text: 'Both, thanks.', next: 'both' },
        tipOption('Woo.CoatCheckTipped', 20, '<em>(Fold it under the ticket.)</em>', 'took'),
        { tone: 'Keep it', text: 'We’ll hold onto them.', next: null },
      ],
    },
    both: {
      who: 'coat check',
      line: '<em>(Two tickets, one hand, no looking.)</em> Ninety-one and ninety-two. '
        + 'You’ll lose yours. They always lose theirs.',
      /* Ends. It used to loop back to `open`, which asked for the coats she
       * had just taken — the first of the talking loops the playtest hit. */
      hold: 4.2,
    },
    took: {
      who: 'coat check',
      line: 'Ta. <em>(To Margo, quietly.)</em> If he abandons you, the phone’s behind me '
        + 'and I’ll get you a car. That’s not a joke, that’s a standing offer.',
      hold: 5.0,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The host station, and the man who overrules it                    */
  /* ---------------------------------------------------------------- */

  const host = {
    /* Before the table exists this is the whole confrontation; after it, he
     * has nothing to be full about. Without the split, talking to him again
     * mid-evening re-ran "Name? …We're full" over a man whose table the
     * manager had already had built — another of the playtest's loops. */
    open: {
      who: 'the host',
      variant: () => (flags.tableBuilt ? 'settled' : 'full'),
      line: () => (flags.tableBuilt
        ? '<em>(He does not consult the book.)</em> Sir. Madam. Everything is exactly '
          + 'where it should be.'
        : '<em>(Running a pencil down the book without looking up.)</em> Name? '
          + '…We’re full. I can do you a nine-forty-five at the back. Behind the column. '
          + 'It’s a table.'),
      options: () => (flags.tableBuilt
        ? [
          tipOption('Woo.HostTipped', 20, '<em>(On the book, on the way past.)</em>', 'settled'),
          { tone: 'Go on', text: 'It is.', next: null },
        ]
        : [
          { tone: 'Wait', text: '<em>(Say nothing. Wait.)</em>', next: 'waited' },
          { tone: 'Push', text: 'Look at the book again.', next: 'push' },
          tipOption('Woo.HostTipped', 20, '<em>(Put something on the book.)</em>', 'took'),
        ]),
    },
    settled: {
      who: 'the host',
      line: '<em>(The pencil closes the book on it.)</em> Very kind. The nine-forty-fives '
        + 'will never know.',
      hold: 3.6,
    },
    waited: {
      who: 'the host',
      line: 'Sir, I have said we’re — <em>(He stops. Somebody behind him has not said '
        + 'anything, and he stops.)</em>',
      enter: () => ctx.startTableCutscene(),
      hold: 3.0,
    },
    push: {
      who: 'the host',
      line: 'I have looked at the book. The book is the book. The book does not — '
        + '<em>(He stops.)</em>',
      enter: () => ctx.startTableCutscene(),
      hold: 3.4,
    },
    took: {
      who: 'the host',
      line: '<em>(He looks at what is under his pencil, and then at you, and then very '
        + 'briefly over his own shoulder.)</em> …One moment.',
      enter: () => ctx.startTableCutscene(),
      hold: 3.0,
    },
  };

  /* The cutscene's own lines. Played on a timeline, no options — the player is
   * watching, and the point of the scene is the speed of the room, not the
   * dialogue. */
  const tableScene = [
    { at: 0.0, who: 'the host',  line: 'I can put you two in the back.' },
    { at: 2.2, who: 'the manager', line: 'No.' },
    { at: 3.4, who: 'the host',  line: 'We don’t have anything else.' },
    { at: 5.0, who: 'the manager', line: 'Then bring something else.' },
    { at: 7.4, who: DATE.name,  line: '<em>(Under her breath.)</em> Bring something else?' },
    { at: 9.0, who: 'the manager', line: '<em>(Not to you. To the room.)</em> Two-top. Front and center. Now.' },
    { at: 12.5, who: '', line: '<em>(Two men come off the floor carrying a table between them.)</em>' },
    { at: 15.5, who: DATE.name, line: '<em>(Quietly.)</em> …There wasn’t a table there.' },
    { at: 18.5, who: 'the manager', line: 'Give us a minute.' },
    { at: 20.5, who: DATE.name, line: 'A minute for what?' },
    { at: 22.5, who: 'the manager', line: '<em>(He steps aside and turns his hand over.)</em> For that.' },
  ];

  const manager = {
    open: {
      who: 'the manager',
      variant: () => (flags.tableBuilt ? 'settled' : 'moment'),
      line: () => (flags.tableBuilt
        ? 'Everything as it should be? <em>(He does not wait for an answer, because it is.)</em>'
        : 'Mr — <em>(he catches himself)</em> — Prospect. One moment.'),
      options: () => [
        tipOption('Woo.CaptainTipped', 50, '<em>(Take care of him.)</em>', 'took'),
        { tone: 'Thanks', text: 'This is more than I asked for.', next: 'more' },
        { tone: 'Casual', text: 'It’ll do.', next: 'do' },
        { tone: 'Leave it', text: 'We’re fine.', next: null },
      ],
    },
    took: {
      who: 'the manager',
      line: '<em>(It vanishes into a waistcoat like it was never in the world.)</em> '
        + 'The band’s on at half past. You’ll want to be sitting for the third number, '
        + 'not the first. Trust me on the third number.',
      enter: () => ctx.remember('third-number'),
      hold: 5.4,
    },
    more: {
      who: 'the manager',
      line: 'You didn’t ask for anything. That’s rather the point of the arrangement. '
        + 'Ma’am.',
      hold: 4.0,
    },
    do: {
      who: 'the manager',
      line: '<em>(A very small pause.)</em> …It’ll do. I’ll pass that to the men who carried it.',
      hold: 4.0,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The table                                                         */
  /* ---------------------------------------------------------------- */

  const seated = {
    /* ROUND 0 — she reacts to the table */
    table: {
      who: DATE.name,
      line: 'They built us a table. <em>(She sits, and looks at the stage, which is four '
        + 'metres away.)</em> There was a room and then there was a table in it.',
      options: [
        { tone: 'Deadpan', text: 'They hate seeing me stand.', next: 'stand',
          effect: () => { fire('Woo.TableReaction'); fire('Woo.MadeHerLaugh'); } },
        { tone: 'Honest', text: 'Big Uncle Lou may have called ahead.', next: 'lou',
          effect: () => fire('Woo.TableReaction') },
        { tone: 'Take credit', text: 'I told you I knew a place.', next: 'credit' },
        { tone: 'Warn her', text: 'Don’t look impressed. It encourages them.', next: 'encourages',
          effect: () => { fire('Woo.TableReaction'); fire('Woo.MadeHerLaugh'); } },
      ],
    },
    stand: {
      who: DATE.name,
      line: '<em>(That gets her. A real one, not a polite one.)</em> Right. Everybody '
        + 'here is terrified of you standing up.',
      next: 'round1',
    },
    lou: {
      who: DATE.name,
      line: 'Big Uncle Lou called ahead. <em>(She nods slowly.)</em> That’s the first true thing '
        + 'anybody’s said to me tonight, including the man who took my coat.',
      next: 'round1',
    },
    credit: {
      who: DATE.name,
      line: 'You knew a place. <em>(She looks at the manager, who is still standing '
        + 'there.)</em> Sure. You knew a place.',
      next: 'round1',
    },
    encourages: {
      who: DATE.name,
      line: 'Too late. I’m visibly impressed. I’m going to be impressed for at least '
        + 'another four minutes and then I’m going to start asking questions.',
      next: 'round1',
    },

    /* ROUND 1 — the entrance */
    round1: {
      who: DATE.name,
      line: 'So. Do you take every woman through the dish room, or am I special.',
      options: [
        { tone: 'Smooth', text: 'Only the ones I’m trying to impress.', next: 'r1-impress' },
        { tone: 'Dry', text: 'The front door has no personality.', next: 'r1-personality',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'Dark', text: 'You should see where I take the ones I don’t like.', next: 'r1-dark' },
        { tone: 'Flat', text: 'We got here, didn’t we.', next: 'r1-flat' },
      ],
    },
    'r1-impress': {
      who: DATE.name,
      line: 'So there’s a shorter route and you didn’t use it. That’s not a shortcut, '
        + 'that’s a tour. <em>(She lifts her glass an inch.)</em> It was a good tour.',
      next: 'r1-close',
    },
    'r1-personality': {
      who: DATE.name,
      line: 'The front door has thirty people and a rope. The back has a man called Marco '
        + 'and a crate nobody’s allowed to touch. You’re right. It’s no contest.',
      next: 'r1-close',
    },
    'r1-dark': {
      who: DATE.name,
      line: '<em>(She holds your eye for a second and a half, which is exactly long enough.)</em> '
        + 'Mm. See, if I flinch there, you win. I run a kitchen at four in the morning. '
        + 'I don’t flinch.',
      next: 'r1-close',
    },
    'r1-flat': {
      who: DATE.name,
      line: 'We got here. Through a cellar. Past a man holding nine hundred pounds of ice. '
        + '"We got here" is doing a great deal of work in that sentence.',
      next: 'r1-close',
    },
    'r1-close': {
      who: DATE.name,
      variant: () => (mission.flags.abandonments >= 2 ? 'noticed' : 'kept-looking'),
      line: () => (mission.flags.abandonments >= 2
        ? 'Although — twice back there I turned round and you were a room away. '
          + 'I noticed. I always notice. It’s the job.'
        : 'You did keep looking back for me, though. Most of them don’t. '
          + 'Most of them walk like they’re being filmed.'),
      enter: () => mission.roundDone('entrance'),
      hold: 4.6,
    },

    /* ROUND 2 — what do you do */
    round2: {
      who: DATE.name,
      line: 'Can I ask you something you’re going to lie about. What do you actually do?',
      options: [
        { tone: 'Classic', text: 'I’m in construction.', next: 'r2-construction' },
        { tone: 'Plain', text: 'I work for Big Uncle Lou.', next: 'r2-lou' },
        { tone: 'Oblique', text: 'I solve things people would rather not write down.', next: 'r2-oblique' },
        { tone: 'Deflect', text: 'Tonight I’m buying dinner. Start there.', next: 'r2-dinner' },
      ],
    },
    'r2-construction': {
      who: DATE.name,
      line: 'Construction. <em>(She looks at your hands. She takes her time about it.)</em> '
        + 'You don’t look like you work construction.',
      options: [
        { tone: 'Riff', text: 'Mostly deconstruction.', next: 'r2-decon',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'Riff', text: 'I supervise.', next: 'r2-supervise' },
        { tone: 'Fold', text: 'Alright. I don’t work construction.', next: 'r2-fold',
          effect: () => fire('Woo.PersonalHonest') },
      ],
    },
    'r2-decon': {
      who: DATE.name,
      line: '<em>(She puts the glass down so she can laugh properly, which is a thing '
        + 'she does and which you are going to want to see again.)</em> Deconstruction. '
        + 'God. Alright.',
      next: 'r2-close',
    },
    'r2-supervise': {
      who: DATE.name,
      line: 'You supervise. Supervise what?',
      options: [
        { tone: 'Commit', text: 'Other people working construction.', next: 'r2-commit',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'Fold', text: 'Nothing. There’s no construction.', next: 'r2-fold',
          effect: () => fire('Woo.PersonalHonest') },
      ],
    },
    'r2-commit': {
      who: DATE.name,
      line: 'Beautiful. Absolutely watertight. I’m putting that on the specials board '
        + 'and I’m not crediting you.',
      next: 'r2-close',
    },
    'r2-fold': {
      who: DATE.name,
      line: 'There it is. <em>(She sits back.)</em> I know what you do, roughly. Two of '
        + 'your lot eat at mine every Tuesday and neither of them has ever paid. I wasn’t '
        + 'asking what you do. I was seeing how long you’d go.',
      next: 'r2-close',
    },
    'r2-lou': {
      who: DATE.name,
      line: 'I know you work for Big Uncle Lou. Everybody on that street works for Lou, including '
        + 'me, technically, if you follow the rent far enough back. <em>(Beat.)</em> '
        + 'I meant what do you <em>do</em>.',
      options: [
        { tone: 'Honest', text: 'Whatever the day is. Mostly I go places and listen.', next: 'r2-listen',
          effect: () => fire('Woo.PersonalHonest') },
        { tone: 'Brag', text: 'Whatever needs doing. Ask anyone in here.', next: 'r2-brag',
          effect: () => fire('Woo.Bragged') },
      ],
    },
    'r2-listen': {
      who: DATE.name,
      line: 'You go places and listen. <em>(She considers this.)</em> That’s a service '
        + 'job. You’re in a service job. Do not tell the men by the pillar I said that.',
      next: 'r2-close',
    },
    'r2-brag': {
      who: DATE.name,
      line: '<em>(She glances round the room, obligingly.)</em> Mm. And how many of them '
        + 'know your first name.',
      next: 'r2-close',
    },
    'r2-oblique': {
      who: DATE.name,
      line: 'That is a beautifully constructed sentence that contains no information. '
        + 'Did you write it down first?',
      options: [
        { tone: 'Yes', text: 'On the way over.', next: 'r2-wrote',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'No', text: 'It came out like that.', next: 'r2-close' },
      ],
    },
    'r2-wrote': {
      who: DATE.name,
      line: 'You wrote it down. <em>(She is delighted. Genuinely.)</em> Fifteen years '
        + 'and I have never once written anything down, including the specials, which is '
        + 'why we have had two health inspections.',
      next: 'r2-close',
    },
    'r2-dinner': {
      who: DATE.name,
      line: 'Smooth. <em>(She lets it go, but she does not let it go — she just puts it '
        + 'somewhere.)</em> Alright. Dinner. We’ll come back to it.',
      next: 'r2-close',
    },
    'r2-close': {
      who: DATE.name,
      line: 'For the record: I don’t care what the answer is. I care whether you think '
        + 'I can’t handle it.',
      hold: 4.4,
    },

    /* ROUND 5 — funny how */
    funny: {
      who: DATE.name,
      line: '<em>(Still laughing at something.)</em> You’re funny. You know that? '
        + 'You’re actually funny.',
      options: [
        { tone: '…', text: 'Funny how?', next: 'funny-how' },
        { tone: 'Take it', text: 'You’re a professional. I’ll take it.', next: 'funny-take' },
        { tone: 'Deflect', text: 'I’m told it’s a coping mechanism.', next: 'funny-cope' },
      ],
    },
    'funny-how': {
      who: '',
      line: '<em>(The table goes quiet. Two men at the next table stop talking. '
        + 'The waiter, halfway down with a tray, does not put it down and does not '
        + 'move.)</em>',
      enter: () => { flags.funnyHow = true; ctx.holdTheRoom(); },
      hold: 3.6,
      next: 'funny-hang',
    },
    'funny-hang': {
      who: DATE.name,
      line: '<em>(She does not blink.)</em> Funny like a man who has practised that '
        + 'question in a mirror.',
      options: [
        { tone: 'Break', text: '<em>(Grin. Let the room breathe.)</em>', next: 'funny-break',
          effect: () => fire('Woo.FunnyHowSuccess') },
        { tone: 'Hold it', text: '<em>(Keep the face on.)</em>', next: 'funny-hold' },
      ],
    },
    'funny-break': {
      who: DATE.name,
      line: '<em>(The room starts again all at once. The waiter puts the tray down and '
        + 'wipes his forehead with the back of his wrist.)</em> You scared your own waiter. '
        + 'That’s the funniest thing that’s happened all week and I do comedy.',
      enter: () => ctx.releaseTheRoom(),
      hold: 5.6,
    },
    'funny-hold': {
      who: DATE.name,
      line: '<em>(Three full seconds. She reaches over, takes the ice cube out of her '
        + 'own drink, and drops it into yours.)</em> …Cool down. You were doing so well.',
      enter: () => { ctx.releaseTheRoom(); fire('Woo.FunnyHowOverplayed'); },
      hold: 5.4,
    },
    'funny-take': {
      who: DATE.name,
      line: 'Don’t take it, it’s not a compliment, it’s an observation. '
        + '<em>(Beat.)</em> …Fine. It’s a bit of a compliment.',
      hold: 4.0,
    },
    'funny-cope': {
      who: DATE.name,
      line: 'Everybody funny is coping with something. The good ones just cope louder '
        + 'and get paid.',
      hold: 4.0,
    },

    /* ROUND 6 — the personal question */
    personal: {
      who: DATE.name,
      variant: () => (woo.score >= 60 ? 'real' : 'boring-true'),
      line: () => (woo.score >= 60
        ? 'Right. Real question. <em>(She turns her glass a quarter turn.)</em> Do they '
          + 'like you, or are they frightened of Big Uncle Lou?'
        : 'Question. And I want the boring true answer, not the good one. '
          + 'Do they like you, or are they frightened of Big Uncle Lou?'),
      options: [
        { tone: 'Honest', text: 'Frightened of Big Uncle Lou. All of it is Lou.', next: 'p-lou',
          effect: () => fire('Woo.PersonalHonest') },
        { tone: 'Ambition', text: 'Frightened of Big Uncle Lou. For now.', next: 'p-fornow',
          effect: () => fire('Woo.PersonalHonest') },
        { tone: 'Loyalty', text: 'Big Uncle Lou pulled me out of something. That’s the whole story.', next: 'p-loyal',
          effect: () => fire('Woo.PersonalHonest') },
        { tone: 'Evade', text: 'Why not both.', next: 'p-both',
          effect: () => fire('Woo.PersonalEvaded') },
      ],
    },
    'p-lou': {
      who: DATE.name,
      line: 'Thank you. <em>(She means it.)</em> Everybody else in this building would '
        + 'have taken the credit and I’d have had to sit here and let them.',
      next: 'p-hers',
    },
    'p-fornow': {
      who: DATE.name,
      line: '"For now." <em>(She raises an eyebrow, not unkindly.)</em> Careful. That’s '
        + 'the sentence men say in here about a year before something happens to them.',
      next: 'p-hers',
    },
    'p-loyal': {
      who: DATE.name,
      line: '<em>(She does not ask what. That is the tell — she knows not to.)</em> '
        + 'Alright. That’s a real answer and I’m not going to poke it.',
      next: 'p-hers',
    },
    'p-both': {
      who: DATE.name,
      line: 'Both. <em>(She smiles with about sixty per cent of her face.)</em> Sure. '
        + 'Both.',
      next: 'p-hers',
    },
    'p-hers': {
      who: DATE.name,
      line: 'My turn, since we’re being people. <em>(She turns her right arm over on the '
        + 'cloth. The burn runs from the wrist most of the way to the elbow, and it is old, '
        + 'and she is not hiding it.)</em> Go on. Everybody looks and nobody asks.',
      options: [
        { tone: 'Ask', text: 'What happened?', next: 'p-burn',
          effect: () => fire('Woo.GenuineQuestion') },
        { tone: 'Ask', text: 'Whose fault?', next: 'p-fault',
          effect: () => { fire('Woo.GenuineQuestion'); fire('Woo.MadeHerLaugh'); } },
        { tone: 'Deflect', text: 'I wasn’t going to ask. I was going to wonder loudly.', next: 'p-joke',
          effect: () => fire('Woo.MadeHerLaugh') },
        { tone: 'Move on', text: '<em>(Let it sit.)</em>', next: 'p-close' },
      ],
    },
    'p-burn': {
      who: DATE.name,
      line: 'Twelve-litre stockpot, wet handle, and a boy who said he had it. '
        + '<em>(She turns the arm back over.)</em> Nineteen. I finished the service. '
        + 'That is the part I would like on the record.',
      next: 'p-close',
    },
    'p-fault': {
      who: DATE.name,
      line: '<em>(Instantly, like she has been waiting years.)</em> Anthony’s. '
        + 'Anthony knows it is Anthony’s. Anthony has a restaurant now and I have this, '
        + 'and I would still rather be me.',
      next: 'p-close',
    },
    'p-joke': {
      who: DATE.name,
      line: 'Wonder loudly. <em>(Pointing at you with two fingers round the glass.)</em> '
        + 'That’s mine now. That’s going on the wall by the pass.',
      next: 'p-close',
    },
    'p-close': {
      who: DATE.name,
      line: 'Anyway. That’s the deep bit done. If the band’s any good we never have to '
        + 'do that again.',
      enter: () => mission.roundDone('personal'),
      hold: 4.2,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The waiter, and what she drinks                                   */
  /* ---------------------------------------------------------------- */

  const waiter = {
    /* `open` is the drink order, ONCE. Talking to him again after the order —
     * he patrols the floor and the tap is always there — used to replay the
     * whole "something to drink for the lady?" round over drinks she already
     * had. Ordered, he offers the table another instead. */
    open: {
      who: 'the waiter',
      variant: () => {
        if (!flags.seated) return 'passing';
        if (flags.drinkOrdered) return 'checking';
        return ctx.knows('third-number') ? 'expected' : 'menus';
      },
      line: () => {
        if (!flags.seated) {
          return '<em>(A nod, without breaking stride.)</em> Sir. Your table is ahead of you.';
        }
        if (flags.drinkOrdered) return 'Sir. Everything as it should be over here?';
        return ctx.knows('third-number')
          ? '<em>(He is already setting down two menus and a jug of water nobody asked '
            + 'for.)</em> Good evening. The kitchen knows you’re here. Drinks?'
          : 'Good evening. <em>(Two menus, and he stands the way they stand: perfectly '
            + 'still, at an angle.)</em> Something to drink for the lady?';
      },
      options: () => (!flags.seated
        ? [{ tone: 'Go on', text: '<em>(Leave him to the floor.)</em>', next: null }]
        : flags.drinkOrdered
          ? [
            { tone: 'Another', text: 'Same again, when you get a second.', next: null },
            tipOption('Woo.WaiterTipped', 40, '<em>(Take care of him.)</em>', 'thanks'),
            { tone: 'No', text: 'We’re looked after, thanks.', next: null },
          ]
          : [
            { tone: 'Remember', text: 'Rye. One ice cube. One.', next: 'rye',
              effect: () => { flags.drinkOrdered = 'rye'; fire('Woo.DrinkRemembered'); } },
            { tone: 'Guess', text: 'She’ll have a glass of the white.', next: 'white',
              effect: () => { flags.drinkOrdered = 'wrong'; fire('Woo.DrinkWrong'); } },
            { tone: 'Ask her', text: 'What are you drinking?', next: 'ask',
              effect: () => { flags.drinkOrdered = 'asked'; fire('Woo.DrinkAsked'); } },
            { tone: 'Grand', text: 'Bring a bottle of whatever the manager drinks.', next: 'bottle',
              effect: () => { flags.drinkOrdered = 'bottle'; } },
          ]),
    },
    rye: {
      who: 'the waiter',
      line: '<em>(He writes nothing down.)</em> Rye, one cube. Sir?',
      next: 'his',
    },
    white: {
      who: DATE.name,
      line: '<em>(To the waiter, pleasantly.)</em> He’s guessing. Rye, one ice cube. '
        + '<em>(To you.)</em> I told you in the car. I told you twice, and one of those '
        + 'times I did a voice.',
      next: 'his',
    },
    ask: {
      who: DATE.name,
      line: 'Rye. One ice cube. <em>(To the waiter.)</em> One. They always bring three '
        + 'and then it’s a soup. <em>(To you.)</em> Asking is allowed. Asking twice isn’t.',
      next: 'his',
    },
    bottle: {
      who: 'the waiter',
      line: '<em>(A flicker of something.)</em> …The manager drinks milk, sir. '
        + 'For his stomach. Shall I bring the rye instead.',
      next: 'bottle-2',
    },
    'bottle-2': {
      who: DATE.name,
      line: '<em>(Into her hand.)</em> Bring the rye. One ice cube. And bring this man '
        + 'whatever he needs.',
      effect: () => { flags.drinkOrdered = 'rye'; },
      next: 'his',
    },
    his: {
      who: 'the waiter',
      line: 'And for yourself?',
      options: () => [
        { tone: 'Same', text: 'Same. Two cubes, I’m not an animal.', next: 'done',
          effect: () => { ctx.order('rye'); fire('Woo.MadeHerLaugh'); } },
        { tone: 'Beer', text: 'Beer’s fine.', next: 'done', effect: () => ctx.order('beer') },
        { tone: 'Whiskey', text: 'Whiskey. Neat.', next: 'done', effect: () => ctx.order('whiskey') },
        { tone: 'Working', text: 'Club soda. I’m working.', next: 'soda', effect: () => ctx.order('soda') },
      ],
    },
    done: {
      who: 'the waiter',
      line: '<em>(Gone. The drinks arrive before you have finished putting the menu down, '
        + 'which is not possible, and nobody at the table remarks on it.)</em>',
      enter: () => { ctx.serveTable(); mission.roundDone('drinks'); },
      hold: 4.6,
    },
    soda: {
      who: DATE.name,
      line: 'Working. <em>(She looks at the stage, the table, the manager.)</em> '
        + 'Is that what this is?',
      enter: () => { ctx.serveTable(); mission.roundDone('drinks'); },
      hold: 4.2,
    },
    /* Later rounds */
    another: {
      who: 'the waiter',
      line: 'Another for the table?',
      options: () => [
        { tone: 'Yes', text: 'Same again. And whatever the band’s drinking.', next: 'band-round',
          effect: () => fire('Woo.ContextualTip') },
        { tone: 'Yes', text: 'Same again.', next: null },
        tipOption('Woo.WaiterTipped', 40, '<em>(And take care of him.)</em>', 'thanks'),
        { tone: 'No', text: 'We’re alright.', next: null },
      ],
    },
    'band-round': {
      who: 'the waiter',
      line: '<em>(He looks at the stage, then back, and something in his face changes '
        + 'about you permanently.)</em> …Yes, sir.',
      hold: 3.8,
    },
    thanks: {
      who: 'the waiter',
      line: 'Very good, sir. <em>(To Margo, on the way past, quietly.)</em> He tipped '
        + 'the dish room. Nobody tips the dish room.',
      hold: 4.6,
    },
    dessert: {
      who: 'the waiter',
      line: 'Anything sweet? Chef does something with figs that people write letters about.',
      options: [
        { tone: 'Yes', text: 'Two. And tell him she asked.', next: 'figs',
          effect: () => fire('Woo.ContextualTip') },
        { tone: 'Ask her', text: 'Are we doing dessert?', next: 'her-call' },
        { tone: 'No', text: 'Not tonight.', next: null },
      ],
    },
    figs: {
      who: 'the waiter',
      line: '<em>(Twenty seconds later Chef is standing at the pass with a towel over '
        + 'his shoulder, looking across the room at your table, and then he goes back '
        + 'in.)</em>',
      hold: 4.6,
    },
    'her-call': {
      who: DATE.name,
      line: 'Obviously we’re doing dessert. I’ve been looking at that man’s figs since '
        + 'we sat down and pretending to listen to you.',
      hold: 4.2,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The interruption                                                  */
  /* ---------------------------------------------------------------- */

  const champagne = [
    { at: 0.0, who: '', line: '<em>(A waiter arrives at the table with a bucket nobody ordered.)</em>' },
    { at: 2.6, who: 'the waiter', line: 'From the gentlemen by the pillar. With respect, they said.' },
    { at: 6.0, who: '', line: '<em>(Four men at a round table. One of them lifts two fingers off the cloth. It is the bouncer from the Bing, in a suit that is nearly his size.)</em>' },
    { at: 11.0, who: DATE.name, line: '<em>(Not looking away from them.)</em> …With respect.' },
  ];

  const ape = {
    open: {
      who: 'Ape',
      line: 'Prospect. <em>(He arrives the way a man arrives when he has been working '
        + 'up to it from across a room.)</em> Look at this. Look at you, sat with the '
        + 'civilians.',
      options: () => [
        { tone: 'Introduce', text: `This is ${DATE.names.right}.`, next: 'intro-right',
          effect: () => { flags.introducedAs = 'right'; fire('Woo.DateIntroduced'); } },
        { tone: 'Introduce', text: `This is ${DATE.names.job}. She cooks.`, next: 'intro-job',
          effect: () => { flags.introducedAs = 'job'; } },
        { tone: 'Introduce', text: `This is ${DATE.names.wrong}.`, next: 'intro-wrong',
          effect: () => { flags.introducedAs = 'wrong'; fire('Woo.WrongName'); } },
        { tone: 'Business', text: 'Not now. What is it?', next: 'business',
          effect: () => fire('Woo.LingeredWithFamily') },
      ],
    },
    'intro-right': {
      who: 'Ape',
      line: '<em>(He takes her hand like it is a formal object, and then he does not let '
        + 'go of it.)</em> Margo. — Margo off Ashland? The Blue Hour? '
        + '<em>(To you, with enormous betrayal.)</em> This is <em>the Blue Hour</em>.',
      next: 'ape-diner',
    },
    'intro-job': {
      who: DATE.name,
      line: '<em>(Pleasantly, without moving.)</em> Margo.',
      next: 'intro-job-2',
    },
    'intro-job-2': {
      who: 'Ape',
      line: '<em>(Shaking her hand and looking at you with something close to pity.)</em> '
        + '…Margo.',
      next: 'ape-diner',
    },
    'intro-wrong': {
      who: DATE.name,
      line: '<em>(Beat. She shakes his hand anyway.)</em> Margo.',
      next: 'intro-wrong-2',
    },
    'intro-wrong-2': {
      who: 'Ape',
      line: '<em>(To you, with the delivery of a man who has waited his whole life for '
        + 'this.)</em> …Marissa.',
      next: 'ape-diner',
    },
    business: {
      who: 'Ape',
      line: 'It’s nothing. It’s a Thursday thing. <em>(He does not leave. He shifts his '
        + 'weight, which is worse.)</em> It’s the Ashland thing, actually, if we’re —',
      options: [
        { tone: 'Shut it down', text: 'Thursday. Not at this table.', next: 'shut',
          effect: () => fire('Woo.FamilyHandled') },
        { tone: 'Let him talk', text: 'Go on.', next: 'ashland',
          effect: () => fire('Woo.GruesomeDetail') },
      ],
    },
    ashland: {
      who: 'Ape',
      line: 'So they found the van, right, and the reason they found the van is the — '
        + '<em>(He describes, in detail, over a plate of food, what was in the van.)</em>',
      next: 'ashland-2',
    },
    'ashland-2': {
      who: DATE.name,
      line: '<em>(She puts her fork down and leaves it down.)</em> That’s Ashland. '
        + 'I grew up on Ashland. <em>(To Ape.)</em> Whose van.',
      next: 'ashland-3',
    },
    'ashland-3': {
      who: 'Ape',
      line: '<em>(Looking at you like a man who has walked into a window.)</em> …I’m '
        + 'going to go back to my table.',
      next: 'leaves',
    },
    shut: {
      who: 'Ape',
      line: '<em>(Immediately, no argument at all.)</em> Thursday. You’re right. '
        + 'Not at the table. <em>(To her.)</em> Sorry. He’s right.',
      next: 'ape-diner',
    },
    'ape-diner': {
      who: 'Ape',
      variant: () => (flags.introducedAs === 'wrong' ? 'ignore-him' : 'four-in-the-morning'),
      line: () => (flags.introducedAs === 'wrong'
        ? '<em>(To her.)</em> Whatever he says your name is, ignore him. He eats at yours. '
          + 'Four in the morning, on his own, every couple of weeks. Pays. Every time.'
        : '<em>(To her.)</em> He eats at yours, you know. Four in the morning, on his own. '
          + 'Pays every time, which around here makes him a lunatic.'),
      options: [
        { tone: 'Deny', text: 'That never happened.', next: 'deny' },
        { tone: 'Own it', text: 'Corner two. Back to the door.', next: 'own',
          effect: () => fire('Woo.CallbackUsed') },
        { tone: 'Move him on', text: 'Ape. Your table’s looking at you.', next: 'leaves',
          effect: () => fire('Woo.FamilyHandled') },
      ],
    },
    deny: {
      who: DATE.name,
      line: 'It happened. <em>(To Ape.)</em> Corner two, back to the door, never once '
        + 'sent anything back. <em>(To you.)</em> You tipped Hector. Nobody tips Hector. '
        + 'Hector is a dishwasher.',
      next: 'leaves',
    },
    own: {
      who: DATE.name,
      line: '<em>(She looks at you for slightly too long.)</em> Corner two. '
        + '<em>(She sits back.)</em> You tipped my dishwasher and then you never '
        + 'mentioned it. Right. Okay. That reframes the evening somewhat.',
      next: 'leaves',
    },
    leaves: {
      who: 'Ape',
      line: 'Right. Enjoy the band. The third one’s the one. <em>(To her, seriously.)</em> '
        + 'It was an honour. <em>(And he goes, and he does not sit down, and he does not '
        + 'come back.)</em>',
      enter: () => { mission.metFamily('Ape'); mission.roundDone('family'); ctx.remember('third-number'); },
      hold: 5.6,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The band                                                          */
  /* ---------------------------------------------------------------- */

  const showScene = [
    { at: 0.0, who: '', line: '<em>(The house lights go down a third. The table lamps stay exactly where they were.)</em>' },
    { at: 3.0, who: '', line: '<em>(The room lowers its voice on its own, without being asked.)</em>' },
    { at: 5.5, who: 'the announcer', line: 'Ladies and gentlemen — the Silver Room is proud — the Midnight Pines.' },
    { at: 9.0, who: '', line: '<em>(Curtain. Seven of them: brass across the back, upright bass, brushes, a piano nobody has tuned since it stopped needing it.)</em>' },
    { at: 12.0, who: DATE.name, line: '<em>(She turns all the way round in her chair.)</em> Oh, they’re real.' },
  ];

  const bandleader = {
    /* Front table gets ONE. Once a number has been asked for, asking again is
     * met with the request already on the pad — the request options re-firing
     * was another way a conversation looped and the set queue got shuffled. */
    open: {
      who: 'the bandleader',
      variant: () => (flags.songRequested ? 'on-the-pad' : 'front-table'),
      line: () => (flags.songRequested
        ? '<em>(Still grinning, already half-turned for the stage.)</em> It’s on the '
          + 'pad. Front table got its one.'
        : 'Evening. <em>(He is mopping his neck with a handkerchief and grinning like '
          + 'a man who has just got away with something.)</em> You’re the front table. '
          + 'Front table gets one.'),
      options: () => (flags.songRequested
        ? [
          tipOption('Woo.BandleaderTipped', 40, '<em>(Into the top pocket.)</em>', 'tipped'),
          { tone: 'Go on', text: 'Play it well.', next: null },
        ]
        : [
          { tone: 'Her band', text: 'Bananaphone. Straight. Like it’s Carnegie Hall.',
            cue: 'vo.silver.player.bandleader.open.1e0ys9u', next: 'horns',
            effect: () => { flags.songRequested = 'banana'; fire('Woo.PerformancePreferenceRemembered'); } },
          { tone: 'Slow', text: 'Something slow.', next: 'slow',
            effect: () => { flags.songRequested = 'slow'; fire('Woo.SongRequested'); } },
          { tone: 'Ask her', text: '<em>(Look at Margo.)</em>', next: 'her-pick' },
          tipOption('Woo.BandleaderTipped', 40, '<em>(Into the top pocket.)</em>', 'tipped'),
        ]),
    },
    horns: {
      who: DATE.name,
      line: '<em>(She looks from you to the violin.)</em> You came prepared to say that '
        + 'out loud. Fine. If he smiles, it doesn’t count.',
      next: 'band-go',
    },
    slow: {
      who: 'the bandleader',
      line: 'Slow it is. <em>(To the stage.)</em> Four! The four!',
      next: 'band-go',
    },
    'her-pick': {
      who: DATE.name,
      line: 'Bananaphone. Completely straight. I want that violinist fighting for his '
        + 'life and nobody smiling.',
      effect: () => { flags.songRequested = 'banana'; },
      next: 'band-go',
    },
    tipped: {
      who: 'the bandleader',
      line: '<em>(He does not look at it either. Nobody in this building looks at '
        + 'it.)</em> Ma’am, anything you want, all night, you raise a finger.',
      next: 'band-go',
    },
    'band-go': {
      who: 'the bandleader',
      line: '<em>(He is already walking backwards towards the stage, still talking to '
        + 'you, and he steps up onto it without looking.)</em>',
      enter: () => ctx.playRequest(),
      hold: 3.6,
    },
  };

  const photographer = {
    open: {
      who: 'the photographer',
      line: 'One for the wall? Everybody at the front table goes on the wall. It’s not '
        + 'optional, strictly, but I ask.',
      options: () => [
        { tone: 'Ask her', text: '<em>(Look at her first.)</em>', next: 'her-say' },
        { tone: 'Yes', text: 'Go on then.', next: 'shoot' },
        tipOption('Woo.PhotographerTipped', 20, 'Make us look expensive.', 'shoot'),
        { tone: 'No', text: 'Not tonight.', next: 'no' },
      ],
    },
    'her-say': {
      who: DATE.name,
      line: 'I have a face for radio and I have been told so professionally. '
        + '<em>(She is already turning her chair in.)</em> Take the picture.',
      next: 'shoot',
    },
    shoot: {
      who: 'the photographer',
      line: '<em>(Flash. She leans in at the last half-second, which is the half-second '
        + 'the picture is of.)</em> Lovely. That one goes up.',
      enter: () => { flags.photo = true; fire('Woo.PhotoTaken'); },
      hold: 4.2,
    },
    no: {
      who: 'the photographer',
      line: 'Fair enough. Some nights aren’t for the wall.',
      hold: 2.8,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The last stretch                                                  */
  /* ---------------------------------------------------------------- */

  const toast = {
    open: {
      who: DATE.name,
      line: '<em>(She lifts her glass an inch and waits, which is a dare.)</em>',
      options: [
        { tone: 'Simple', text: 'To the third number.', next: 'good',
          effect: () => { flags.toast = 'third'; fire('Woo.ToastMade'); } },
        { tone: 'Hers', text: 'To Ashland, and to the tiles they couldn’t get up.', next: 'ashland',
          when: () => ctx.knows('ashland'),
          effect: () => { flags.toast = 'ashland'; fire('Woo.ToastMade'); fire('Woo.CallbackUsed'); } },
        { tone: 'Grand', text: 'To everybody in this room, who all know me.', next: 'grand',
          effect: () => { flags.toast = 'grand'; fire('Woo.ToastFumbled'); fire('Woo.Bragged'); } },
        { tone: 'Nothing', text: '<em>(Just clink.)</em>', next: 'clink' },
      ],
    },
    good: {
      who: DATE.name,
      line: 'The third number. <em>(Glass.)</em> Good. Short. Nobody wants a speech '
        + 'in a nightclub.',
      hold: 3.8,
    },
    ashland: {
      who: DATE.name,
      line: '<em>(She does not drink for a second.)</em> …That’s a horrible thing to '
        + 'do to a person in a good mood. <em>(She drinks.)</em> To the tiles.',
      hold: 4.6,
    },
    grand: {
      who: DATE.name,
      line: '<em>(She drinks anyway, which is worse than not drinking.)</em> Mm. '
        + 'To the room. To all of the room.',
      hold: 4.0,
    },
    clink: {
      who: DATE.name,
      line: '<em>(Glass. She lets it be quiet, and it is fine.)</em>',
      hold: 3.0,
    },
  };

  const sway = {
    open: {
      who: DATE.name,
      variant: () => (['banana', 'horns'].includes(flags.songRequested) ? 'her-horns' : 'floor-is-up'),
      line: () => (['banana', 'horns'].includes(flags.songRequested)
        ? '<em>(The violin lands the first Bananaphone phrase and she is on her feet before the '
          + 'second bar.)</em> No. Up. Now. This one you don’t sit through.'
        : '<em>(She is watching the floor beside the stage, where two couples are '
          + 'already up.)</em>'),
      options: () => [
        { tone: 'Yes', text: '<em>(Get up.)</em>', next: 'up' },
        { tone: 'Ask', text: 'I should warn you I’m terrible.', next: 'warned' },
        { tone: 'No', text: 'I’d rather watch.', next: 'declined',
          effect: () => { flags.swayed = 'refused'; fire('Woo.SwayRefused'); } },
      ],
    },
    warned: {
      who: DATE.name,
      line: 'I’ve heard four hundred men say that and two of them meant it. '
        + '<em>(She is already standing.)</em>',
      next: 'up',
    },
    up: {
      who: '',
      line: '<em>(Six feet of floor by the stage. Not a dance floor. A gap.)</em>',
      enter: () => ctx.startSway(),
      hold: 2.0,
    },
    declined: {
      who: DATE.name,
      line: '<em>(She sits back down without making anything of it, which is somehow '
        + 'worse than if she had.)</em> Sure. Watching’s good.',
      hold: 3.8,
    },
    good: {
      who: DATE.name,
      line: '<em>(Back at the table, still half in it.)</em> You’re not terrible. '
        + 'You’re economical. There’s a difference and it took me two songs to work it out.',
      hold: 4.6,
    },
    bad: {
      who: DATE.name,
      line: 'That was genuinely one of the worst things I have ever been part of and '
        + 'I have pulled a man out of a walk-in with his own apron.',
      options: [
        { tone: 'Own it', text: 'I peaked in the cellar.', next: 'recover',
          effect: () => { fire('Woo.SwayRecovered'); fire('Woo.MadeHerLaugh'); } },
        { tone: 'Excuse', text: 'The floor’s uneven.', next: 'excuse' },
      ],
    },
    recover: {
      who: DATE.name,
      line: '<em>(Wheezing.)</em> "I peaked in the cellar." Right. That one I am telling '
        + 'the whole kitchen on Tuesday, and I am still not crediting you.',
      hold: 4.8,
    },
    excuse: {
      who: DATE.name,
      line: 'The floor’s uneven. <em>(She looks at the floor. It is not.)</em> Mm.',
      hold: 3.4,
    },
    forced: {
      who: DATE.name,
      line: '<em>(She takes her wrist back, carefully, and does not raise her voice, '
        + 'which is how you know.)</em> I said I’d rather watch.',
      enter: () => { flags.swayed = 'forced'; fire('Woo.SwayForced'); },
      hold: 4.4,
    },
  };

  const invitation = {
    /* The plates go, and the evening has run out of things to be about.
     *
     * Played completely straight: nobody remarks on the situation, nobody
     * says the word date, and she does not ask him anything. She puts the
     * decision on the table and leaves it there, which is the only pressure
     * this beat needs and the reason it is the beat the whole thirty minutes
     * has been for. */
    plates: {
      who: DATE.name,
      line: '<em>(The plates go. She turns her glass a quarter turn on the cloth and '
        + 'leaves it alone.)</em> They’ll do one more and then they’ll put the lights up. '
        + 'That’s how these places end.',
      hold: 5.4,
    },
    /* And if he sits on it. She is not annoyed and she does not repeat
     * herself; she has simply decided to be the one who says something, which
     * costs him nothing on the score and something else entirely. */
    waiting: {
      who: DATE.name,
      line: '<em>(She reaches under the table for her bag, and then does not pick it '
        + 'up.)</em> Alright. Somebody has to go first, and it isn’t going to be you.',
      hold: 4.6,
      next: 'open',
    },
    open: {
      who: DATE.name,
      enter: () => ctx.openInvitation?.(),
      variant: () => (woo.score >= 88 ? 'looking-at-the-door' : woo.score >= 60 ? 'she-claps' : 'checks-the-time'),
      line: () => {
        if (woo.score >= 88) return '<em>(She has been looking at the door for about a minute and not saying anything about it.)</em>';
        if (woo.score >= 60) return '<em>(The set finishes. The room claps. She claps, and then she looks at you.)</em>';
        return '<em>(She checks the time on your watch rather than asking.)</em>';
      },
      options: () => [
        { tone: 'Plain', text: 'You want to come back for a drink?', next: 'judge',
          effect: () => { flags.invitation = 'plain'; } },
        { tone: 'Callback', text: 'I’ve got a better bottle of the rye at the apartment.', next: 'judge',
          when: () => flags.drinkOrdered === 'rye',
          effect: () => { flags.invitation = 'callback'; fire('Woo.CallbackUsed'); } },
        { tone: 'Open', text: 'The night doesn’t have to end here.', next: 'judge',
          effect: () => { flags.invitation = 'open'; } },
        { tone: 'Self-deprecating', text: 'You should see the place when nobody’s threatening to repossess it.', next: 'judge',
          effect: () => { flags.invitation = 'wry'; fire('Woo.MadeHerLaugh'); } },
        /* The line costs what it costs wherever the evening had got to. A
         * charming man saying this is a charming man saying this — the score
         * used to buy him out of it entirely, because nothing fired. */
        { tone: 'Overconfident', text: 'Car’s outside. Come on.', next: 'judge',
          effect: () => { flags.invitation = 'crude'; fire('Woo.CrudeInvitation'); } },
        { tone: 'Transactional', text: '<em>(Put money on the tablecloth.)</em>', next: 'judge',
          effect: () => { flags.invitation = 'transactional'; fire('Woo.PaidForAffection'); } },
        { tone: 'Don’t', text: 'I’ll get you a car. This was good.', next: 'judge',
          effect: () => { flags.invitation = 'none'; } },
      ],
    },
    judge: {
      who: '',
      line: '',
      enter: () => ctx.judgeInvitation(),
      hold: 0.4,
    },

    /* Her answers, chosen by mission.resolve() */
    perfect: {
      who: DATE.name,
      line: 'You’ve been inviting me back for about twenty minutes without actually '
        + 'saying it. <em>(She is already reaching for her coat ticket.)</em> Are you '
        + 'going to keep talking, or are we leaving?',
      hold: 5.4,
    },
    strong: {
      who: DATE.name,
      line: 'One drink. <em>(Beat.)</em> And if your building has a service entrance, '
        + 'I’m getting back in the car and you can explain it to the man on the door.',
      hold: 4.8,
    },
    good: {
      who: DATE.name,
      line: 'I had a genuinely good time. Don’t ruin it by being in a hurry. '
        + '<em>(She writes nothing down, because she does not have to.)</em> '
        + 'Four in the morning. I’m there. You know where the door is.',
      hold: 6.0,
    },
    gentleman: {
      who: DATE.name,
      line: '<em>(A pause, and then something in her face resettles.)</em> …Alright. '
        + 'Come in some night. Late. I cook better for one person than for forty and '
        + 'nobody has ever let me prove it.',
      hold: 5.2,
    },
    polite: {
      who: DATE.name,
      line: 'That’s kind. <em>(The coat check is already coming across the floor with '
        + 'her coat, which means she asked somebody a while ago.)</em>',
      hold: 4.8,
    },
    awkward: {
      who: DATE.name,
      line: 'I’m going to let them call me a car. <em>(Politely. Very politely.)</em> '
        + 'Thank you for dinner. The band was excellent.',
      hold: 5.0,
    },
    disaster: {
      who: DATE.name,
      line: '<em>(She stands up, puts her napkin on the chair rather than the table, '
        + 'and goes back the way you brought her in.)</em>',
      hold: 5.0,
    },
    insult: {
      who: DATE.name,
      line: '<em>(She looks at the money for a long moment. Then at you. Then she picks '
        + 'up her bag and does not touch it.)</em> …Huh.',
      hold: 5.4,
    },
    'from-a-distance': {
      who: DATE.name,
      line: 'I like you. <em>(She is laughing, and she is also standing.)</em> From a '
        + 'distance. A good distance. About this one.',
      hold: 5.0,
    },
  };

  /* Small authored moments outside a conversation tree still live in the
   * script. Keeping the subtitle and cue together means the voice audit can
   * see them, instead of leaving a one-off line stranded in main.js. */
  const moments = {
    chairPulled: {
      who: DATE.name,
      line: 'Somebody raised you. I want their name.',
      hold: 4.6,
    },
  };

  /* Cast the ones that have been cast.
   *
   * Every tree goes through `voiced`; it only stamps the speakers in
   * `VOICE_OF`, so the mixed trees do the right thing without being split up
   * — the waiter's tree is half Margo, the ape's is half Margo, and the
   * cutscene changes speaker every other beat. Anybody who has not been cast
   * comes out of here exactly as they went in and stays subtitled. */
  const trees = {
    driver, arrival, doorman, cellarman, delivery, porter, chef, linecook, dishwasher,
    servicebar, coatcheck, host, manager, seated, waiter, ape, bandleader,
    photographer, toast, sway, invitation, moments,
  };
  for (const [name, tree] of Object.entries(trees)) voiced(name, tree);
  return {
    ...trees,
    scenes: {
      table: voicedScene('scene-table', tableScene),
      champagne: voicedScene('scene-champagne', champagne),
      show: voicedScene('scene-show', showScene),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Things she says without being spoken to                             */
/* ------------------------------------------------------------------ */

/**
 * Her running commentary. Keyed by where she is and what just happened; the
 * companion picks one, marks it used, and does not say it again.
 */
export const DATE_BARKS = {
  alley: [
    'There is an actual entrance around the corner. I saw it. It had a light over it.',
    '<em>(Stepping over something.)</em> If these are ruined you’re buying me shoes and I’ll pick them.',
  ],
  door: [
    'He didn’t ask your name. He didn’t ask anything. He just opened it.',
  ],
  cellar: [
    'Is this normal? Genuinely. Is this a normal way to arrive somewhere.',
    'It smells exactly like my own walk-in and I am furious about how much better it is.',
  ],
  kitchen: [
    '<em>(Counting, under her breath, without meaning to.)</em> …Eleven of them on a Tuesday. '
      + 'I have four and I have to beg.',
    'Everybody in here knows you. <em>(Beat.)</em> Everybody in here is <em>mid-service</em>, and they still know you.',
    'That man put down a pan. <em>(Flatly.)</em> I run a kitchen. Nobody puts down a pan.',
  ],
  corridor: [
    'The music’s getting louder. That’s the trick, isn’t it. You’ve been walking me towards it the whole time.',
  ],
  floor: [
    '<em>(Stopping in the curtain for a second.)</em> …Oh, that’s a room.',
  ],
  tipped: [
    '<em>(Quietly.)</em> That’s the fourth one.',
    'You’ve given away more tonight than I make in a week and none of them thanked you properly.',
    'Do they get to keep that, or does it go in a tin somewhere?',
  ],
  recognised: [
    'That’s another one.',
    '<em>(Amused.)</em> Somebody else who knows you. Shocking.',
  ],
  behind: [
    'I’m back here. Still back here.',
    'You’ve done this before. You do it well. You do it slightly too fast.',
  ],
  shut: [
    '<em>(On the other side of it.)</em> …Right. I’ll get this one, shall I.',
    'That’s twice you’ve shut a door with me on the wrong side of it.',
  ],
  waited: [
    '<em>(Arriving, unhurried, because he stopped.)</em> Thank you. That’s all. Thank you.',
  ],
  staring: [
    '<em>(Following your eyeline to the stage, and back.)</em> They’re very good. I’m also here.',
    'You can watch the band. I do four hours a night talking to a wall, I’ll survive.',
  ],
  spill: [
    '<em>(Moving her own glass out of the way, unhurried, without comment.)</em>',
  ],
  waiting1: ['Take your time. I’ve got all night and a job at ten.'],
  waiting2: ['Right — are we doing something, or is this the evening?'],
  waiting3: ['I stand up for fourteen hours a day. I did not dress like this to keep doing it.'],
  hazard: ['<em>(As a tray goes past her ear.)</em> Thank you. Genuinely, thank you.'],
  show: ['Seven of them. On a Tuesday. In a room this size.'],
};

/** What the club sounds like when you are not being spoken to. */
export const BARKS = {
  alley: [
    ['a porter', 'If it’s not on the sheet it’s not in the building.'],
    ['a smoker', '<em>(By the bins, to nobody.)</em> Four minutes. Four. I’m owed four.'],
  ],
  cellar: [
    ['a cellarman', 'Not that rack. That rack’s the manager’s and he counts them.'],
    ['a delivery driver', 'They signed for nine. I brought twelve. Somebody explain nine.'],
  ],
  kitchen: [
    ['the pass', 'Two veal, one fish, and where is my sauce — WHERE is my sauce —'],
    ['a cook', 'Behind! Behind you! Hot — hot — HOT —'],
    ['a cook', 'Table nine sent it back. Table nine sends everything back.'],
    ['a porter', 'Who has taken the good tray. Somebody has taken the good tray.'],
    ['the pass', 'Heard. Heard. Two minutes on the veal.'],
    ['a cook', 'That’s not a garnish, that’s a hedge.'],
  ],
  /* Appended for the same reason as the floor, and under the same rule. The
   * corridor is nine metres the player walks slowly, twice. */
  corridor: [
    ['coat check', 'Ninety-one and ninety-two. No, ninety-<em>one</em>.'],
    ['a waiter', 'The four-top by the pillar wants the band’s setlist. In writing.'],
    ['a musician', '<em>(Going past with a horn case.)</em> Sorry — sorry — sorry —'],
    ['coat check', 'It’s a fur. I’m not hanging a fur next to a wet mac, I don’t care whose it is.'],
    ['a waiter', 'Who took the front table? Nobody took the front table. The front table walked in.'],
    ['a porter', 'Down the middle. Down the middle! You go wide, you go through the drape.'],
  ],
  /* The dining room is where the player spends the long half of the evening,
   * and seven lines could not carry it — at one every twenty-eight to
   * forty-eight seconds across the seated half, the room got through its
   * whole vocabulary about four times over and then started again, which is
   * the note: "the diners need different voicelines."
   *
   * APPENDED, never inserted. Every one of these is `vo.silver.room.floor.N`
   * where N is its position, the recordings for the first seven exist and are
   * indexed under those numbers, and the front-door line is addressed by index
   * in two places — `barks()` retires it after its first airing, and the
   * harness aims at it. Reordering this list silently reassigns seven takes to
   * the wrong lines.
   *
   * Two hundred people at dinner, overheard in the middle: half of them are
   * having a restaurant evening and half of them are having this city's
   * evening, and nobody is explaining anything to anybody because everybody at
   * the table already knows.
   */
  floor: [
    ['a diner', 'He calls it a franchise. It’s a van. I’ve seen the van.'],
    ['a diner', 'And they gave him Wednesdays. Wednesdays!'],
    ['a waiter', 'Two more by the stage, and hurry, they’re on at half past.'],
    ['a diner', 'Out of respect. That’s what he said. Out of respect, and then he took the whole route.'],
    ['a diner', 'You don’t put Big Uncle Lou on a list. Lou doesn’t wait for a table.'],
    ['a diner', 'The front door’s for civilians. That’s not me being clever, that’s the actual policy.'],
    ['a waiter', 'Front and center just went out. Somebody find out who that is.'],
    ['a diner', 'Thirty-one years on that corner, and the son wants to put a wine list in it.'],
    ['a diner', '<em>(Not lowering her voice even slightly.)</em> He was there. I saw him. He was at the christening.'],
    ['a waiter', 'Nine wants dessert, eleven is still on the fish, and twelve has not decided anything since they sat down.'],
    ['a diner', 'I don’t ask. That is the arrangement. I don’t ask, and I sleep.'],
    ['a diner', 'Did you see the coat. Look at the coat. That is not a birthday coat.'],
    ['a waiter', 'That’s not the good rye. Take it back, and don’t let him see you take it back.'],
    ['a diner', 'Everybody’s a cousin. I have cousins I’ve met twice and one of them does my books.'],
    ['a diner', 'Six weeks they told me. Six weeks, and we’re sat behind a pillar.'],
    ['a waiter', 'Two rye, one ice. <em>One.</em> If that comes back with three in it, it’s on you.'],
    ['a diner', 'He orders for the whole table. Every time. I have never once eaten what I wanted in this room.'],
    ['a diner', '<em>(Halfway through a story he has plainly told before.)</em> — and the horse was fine! Nobody ever remembers that part!'],
    ['a waiter', 'Anything they want, all night, and none of it goes on a bill. Those were the words I was given.'],
    ['a diner', 'Ask me next week. Next week I’ll know, and then I won’t be able to tell you.'],
  ],
};

/** The narrator, room by room. */
export const NOTES = {
  street: [
    'Rain on the tarmac, a queue thirty deep under the awning, and a sign in brass that '
      + 'has been there long enough to be a landmark.',
    'As far back as you can remember, you have wanted to be the man who does not stand in that queue.',
  ],
  alley: [
    'Bins, a fire door propped with a milk crate, and somebody’s cigarette glowing in the dark '
      + 'like it is on a break from something.',
  ],
  cellar: [
    'Cold, low, and racked to the ceiling. Everything down here is worth more than everything upstairs.',
  ],
  kitchen: [
    'Eleven people in a space for six, moving at a speed that only looks like chaos from outside it.',
  ],
  corridor: [
    'The floor changes under you: concrete, then rubber matting, then carpet. That is the whole '
      + 'building explained in nine metres.',
  ],
  floor: [
    'Two hundred people, low light, white cloth, and a stage with the curtain still shut.',
    'Every table in here was booked six weeks ago. Yours did not exist eleven minutes ago.',
  ],
};
