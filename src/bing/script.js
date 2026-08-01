const VOICE_BY_SCOPE = Object.freeze({
  bouncer: 'doorman', bartender: 'bartender', hallGuard: 'doorman', security: 'doorman',
  dealer: 'dealer', lou: 'lou', associate: 'doorman', dj: 'announcer', margo: 'margo',
});

function plainWords(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function textHash(value) {
  let h = 2166136261;
  for (const ch of plainWords(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function generatedCue(scope, nodeId, role, text) {
  return `vo.bing.full.${scope}.${nodeId}.${role}.${textHash(text)}`;
}

function valueOf(value) { return typeof value === 'function' ? value() : value; }

/**
 * Decorate every authored Bing line without replacing deliberately named
 * clips already in the manifest. tools/bing-vo.mjs consumes this same shape.
 */
export function applyBingVoiceCues(scripts) {
  for (const [scope, tree] of Object.entries(scripts)) {
    if (!tree || tree.__bingVoiceDecorated) continue;
    Object.defineProperty(tree, '__bingVoiceDecorated', { value: true });
    for (const [nodeId, node] of Object.entries(tree)) {
      if (!node || typeof node !== 'object') continue;
      if (node.line && !Object.hasOwn(node, 'cue')) {
        const line = node.line;
        node.cue = () => generatedCue(scope, nodeId, 'line', valueOf(line));
      }
      if (!node.options) continue;
      const decorate = (options) => (options || []).map((option) => {
        if (!option?.text || option.cue) return option;
        const text = option.text;
        return { ...option, cue: () => generatedCue(scope, nodeId, 'tony', valueOf(text)) };
      });
      if (typeof node.options === 'function') {
        const options = node.options;
        node.options = (...args) => decorate(options(...args));
      } else node.options = decorate(node.options);
    }
  }
  return scripts;
}

export function bingVoiceForScope(scope) { return VOICE_BY_SCOPE[scope] ?? 'player'; }
export { plainWords };

/**
 * Everything anybody says in the Bing.
 *
 * Kept out of the systems the way the radio's writing is kept out of the
 * radio: this file is the script, dialogue.js is the machine that plays it,
 * and neither has to know much about the other. Nodes may read the mission
 * state, so a man who has been kept waiting eleven minutes greets you
 * differently from a man who has been kept waiting eleven seconds.
 *
 * ---- voice ----
 * A node's `cue` is an EXACT manifest name played by main.js's voiceCue(): no
 * group picking, no synth fallback, silence until the recording exists. The
 * rule that goes with it is that the cue's `say` text in the manifest and the
 * node's `line` here are the same words. A recording that says one thing over
 * a subtitle that says another is worse than no recording at all, so where a
 * bark already existed in the manifest and had never been hooked up -- the
 * doorman's two, the bartender's three, Lou's two floor lines -- the node
 * that carries it says exactly what was recorded, and the line it displaced
 * became the beat after it.
 */

/**
 * @param {object} ctx { mission, flags, money, drunkLevel, jackpot, hands, spins }
 */
export function buildScripts(ctx) {
  const { mission } = ctx;

  /* ---------------------------------------------------------------- */
  /* The bouncer, under the heater                                     */
  /* ---------------------------------------------------------------- */
  const bouncer = {
    open: {
      who: 'Bouncer',
      line: 'Lou know you’re coming?',
      options: [
        { tone: 'Direct', text: 'He’s expecting me.', next: 'direct' },
        { tone: 'Annoyed', text: 'He better be. I drove through Jersey.', next: 'annoyed' },
        { tone: 'Friendly', text: 'You’re looking healthy. Wider, but healthy.', next: 'friendly' },
        { tone: 'Say nothing', text: '…', next: 'silent' },
      ],
    },
    direct: {
      who: 'Bouncer',
      line: 'Everybody’s expected. Nobody’s expected. Go on.',
      next: 'done',
    },
    annoyed: {
      who: 'Bouncer',
      line: 'You drove through Jersey. In Jersey. To Jersey. Go in before I have to think about it.',
      next: 'done',
    },
    friendly: {
      who: 'Bouncer',
      line: 'That’s the coat. It’s a big coat.',
      next: 'done',
    },
    silent: {
      who: 'Bouncer',
      line: 'You’re no fun since they made you a prospect.',
      next: 'done',
    },
    /* The recorded clearance bark. He waves you through in his own voice,
     * and the line that used to live here follows it in. */
    done: {
      who: 'Bouncer',
      line: 'Go on in. He knows.',
      cue: 'vo.bing.door.in.1',
      enter: () => { ctx.flags.bouncerCleared = true; },
      hold: 2.0,
      next: 'through',
    },
    through: {
      who: 'Bouncer',
      line: 'He’s in the back. Don’t make me come find you.',
      hold: 2.4,
    },
    returning: {
      who: 'Bouncer',
      line: 'Nice night. Stays nice if you’re nice.',
      cue: 'vo.bing.door.in.2',
      hold: 2.2,
      next: 'returning2',
    },
    returning2: {
      who: 'Bouncer',
      line: 'Back so soon. That’s either very good or very bad.',
      hold: 2.6,
    },
    leaving: {
      who: 'Bouncer',
      line: 'Drive safe. And I mean the speed limit, not the other thing.',
      hold: 2.8,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The bartender                                                     */
  /* ---------------------------------------------------------------- */
  const bartender = {
    open: {
      who: 'Bartender',
      line: () => (ctx.flags.gotPackage
        ? 'You’re done already? He must like you.'
        : 'Lou’s in the back. He said don’t make him wait.'),
      options: () => (ctx.flags.gotPackage
        ? [
          { tone: 'Order', text: 'One for the road.', next: 'order' },
          { tone: 'Chance it', text: 'Put it on Booski’s tab.', next: 'tab' },
          { tone: 'Leave', text: 'Another time.', next: null },
        ]
        : [
          { tone: 'Dry', text: 'Then why’d you put a bar between me and his office?', next: 'joke' },
          { tone: 'Order', text: 'What have you got?', next: 'order' },
          { tone: 'Ask', text: 'Anything I should know before I go back there?', next: 'tip' },
          { tone: 'Leave', text: 'Later.', next: null },
        ]),
    },
    joke: {
      who: 'Bartender',
      line: 'Architecture. Take it up with the architect. He’s dead.',
      next: 'order',
    },
    tip: {
      who: 'Bartender',
      line: 'Somebody’s been sat in the lot twenty minutes. Engine off. Two of them. '
        + 'Not drinking, not leaving, not my business.',
      enter: () => {
        ctx.flags.heardAboutCar = true;
        mission.note('The bartender has clocked a car in the lot.');
      },
      next: 'order',
    },
    order: {
      who: 'Bartender',
      line: 'What’re we havin’?',
      cue: 'vo.bing.bar.1',
      options: [
        { tone: 'Club soda', text: 'Club soda. I’m working.', next: 'soda', effect: () => ctx.order('soda') },
        { tone: 'Beer', text: 'Beer.', next: 'pour', effect: () => ctx.order('beer') },
        { tone: 'Whiskey', text: 'Whiskey. Neat.', next: 'pour', effect: () => ctx.order('whiskey') },
        { tone: 'Coffee', text: 'Whatever Lou drinks.', next: 'lou-drink', effect: () => ctx.order('coffee') },
      ],
    },
    /* The third recorded bar line, and the only place in the club it belongs. */
    tab: {
      who: 'Bartender',
      line: 'Booski’s tab? Booski’s tab is a myth I refill.',
      cue: 'vo.bing.bar.3',
      hold: 2.6,
      next: 'order',
    },
    soda: {
      who: 'Bartender',
      line: 'Club soda. There you go. Big night.',
      hold: 2.4,
    },
    pour: {
      who: 'Bartender',
      line: 'Comin’ up. Don’t watch me pour, it makes the hands weird.',
      cue: 'vo.bing.bar.2',
      hold: 2.6,
      next: 'poured',
    },
    poured: {
      who: 'Bartender',
      line: () => (ctx.drunkLevel() > 0.42
        ? 'This is the last one before he sees you. I mean that as a favour.'
        : 'On the house. Everything in here is on the house until Lou says otherwise.'),
      hold: 2.8,
    },
    'lou-drink': {
      who: 'Bartender',
      line: 'Coffee. Black, and he complains about it. Enjoy.',
      hold: 2.6,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The guard outside the office                                      */
  /* ---------------------------------------------------------------- */
  const hallGuard = {
    open: {
      who: 'Guard',
      line: () => (ctx.flags.gotPackage
        ? 'That sit comfortable?'
        : 'He’s in a mood.'),
      options: () => (ctx.flags.gotPackage
        ? [{ tone: 'Dry', text: 'It’s tailoring.', next: 'tailoring' }]
        : [
          { tone: 'Ask', text: 'That narrow it down?', next: 'no' },
          { tone: 'Go in', text: 'Then I won’t keep him.', next: null },
        ]),
    },
    no: {
      who: 'Guard',
      line: 'No. Go in. He’s been staring at the same page five minutes.',
      hold: 2.8,
    },
    tailoring: {
      who: 'Guard',
      line: 'Sure it is. Keep your jacket shut in the lot.',
      hold: 2.8,
    },
  };

  /* ---------------------------------------------------------------- */
  /* Security, when you get on the stage                               */
  /* ---------------------------------------------------------------- */
  const security = {
    open: {
      who: 'Security',
      line: 'Prospect. Floor’s down there.',
      options: [
        { tone: 'Dry', text: 'I’m checking the structural integrity.', next: 'chair' },
        { tone: 'Get down', text: 'Alright, alright.', next: null },
      ],
    },
    chair: {
      who: 'Security',
      line: 'Check it from a chair.',
      hold: 2.4,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The dealer, who says almost nothing                               */
  /* ---------------------------------------------------------------- */
  const dealer = {
    open: {
      who: 'Dealer',
      line: 'Seat’s open. Twenty-five minimum.',
      options: [
        { tone: 'Sit', text: 'Deal me in.', next: null, effect: () => ctx.sitAtTable?.() },
        { tone: 'Ask', text: 'This table straight?', next: 'straight' },
        { tone: 'Leave', text: 'Not tonight.', next: null },
      ],
    },
    straight: {
      who: 'Dealer',
      line: 'The cards are.',
      hold: 2.2,
    },
  };

  /* ---------------------------------------------------------------- */
  /* Lou                                                               */
  /* ---------------------------------------------------------------- */
  const lou = {
      /* He does not look up straight away. That is the whole character. The
       * action belongs in the staging, not in the line: a subtitle or voice
       * should never read an actor direction out loud. */
      enter: {
        who: 'Lou',
        line: 'Shut the door.',
        hold: 3.0,
        next: 'arrival',
      },
      /* The door order is always Lou's first spoken line. If Tony spent most
       * of the night getting here, Lou's reactive follow-up still survives as
       * its own beat instead of replacing that recorded opening. */
      arrival: {
        who: 'Lou',
        line: () => {
          const w = mission.waited;
          if (w > 8 * 60) return 'Sit down. Or don’t. You’ve had all night to decide.';
          if (w > 5 * 60) return 'There he is.';
          return null;
        },
        cue: null,
        hold: 1.8,
        next: 'greet',
      },
    greet: {
      who: 'Lou',
      line: () => {
        if (ctx.flags.jackpot) return 'You came here for a package and nearly left with forty pounds of quarters.';
        if (ctx.drunkLevel() > 0.42) return 'You’ve been at my bar. I can hear it from here.';
        if (mission.waited > 5 * 60) return 'You took your time.';
        return 'You took your time. Relatively speaking.';
      },
      options: () => [
        { tone: 'Professional', text: 'I came straight in.', next: 'straight', when: () => mission.waited < 3 * 60 },
        { tone: 'Defensive', text: 'Your slot machine attacked me.', next: 'machine', when: () => ctx.spins() > 0 },
        { tone: 'Casual', text: 'Place looks busy.', next: 'busy' },
        { tone: 'Flat', text: 'You called. I’m here.', next: 'called' },
      ],
    },
    straight: {
      who: 'Lou',
      line: 'You did. I noticed. Don’t get used to being noticed.',
      next: 'warning',
    },
    machine: {
      who: 'Lou',
      line: 'That machine has taken more off this crew than the state has. '
        + '<em>(He breathes out through his nose.)</em> Sit down.',
      next: 'warning',
    },
    busy: {
      who: 'Lou',
      line: 'It’s Tuesday. Tuesday’s busy. Wednesday’s worse.',
      next: 'warning',
    },
    called: {
      who: 'Lou',
      line: '<em>(He looks at you for a moment longer than is comfortable.)</em> I did.',
      next: 'warning',
    },
    warning: {
      who: 'Lou',
      line: 'This next place. You listen before you move. You understand?',
      cue: 'vo.bing.lou.brief.1',
      options: [
        { tone: 'Agree', text: 'I understand.', next: 'agree' },
        { tone: 'Confident', text: 'I know what I’m doing.', next: 'confident' },
        { tone: 'Question', text: 'What changed?', next: 'changed' },
        { tone: 'Dismissive', text: 'They’re jerky dealers.', next: 'jerky' },
      ],
    },
    agree: {
      who: 'Lou',
      line: 'Good. That’s the first thing you’ve said tonight I believe.',
      cue: 'vo.bing.lou.brief.2',
      next: 'parcel',
    },
    confident: {
      who: 'Lou',
      line: 'Everybody knows what they’re doing. The ones who don’t come back knew as well.',
      next: 'parcel',
    },
    changed: {
      who: 'Lou',
      line: 'Nothing changed. That’s what worries me. It should have, by now.',
      next: 'parcel',
    },
    jerky: {
      who: 'Lou',
      line: '<em>(He leans forward.)</em> That’s exactly the sentence people say before things get complicated.',
      next: 'parcel',
    },
    /* The drawer, and the thing on the desk. He does not hand it over --
     * it sits there until the player physically takes it. */
    parcel: {
      who: 'Lou',
      line: '<em>(He opens the drawer and puts a cloth bundle on the desk.)</em> Clean, simple, and not connected to you.',
      cue: 'vo.bing.lou.brief.3',
      enter: () => ctx.showParcel(),
      hold: 3.6,
      next: 'waiting',
    },
    waiting: {
      who: 'Lou',
      line: () => 'It’s not going to walk over to you.',
      cue: 'vo.bing.lou.brief.4',
      options: [
        { tone: 'Ask', text: 'What is it?', next: 'whatisit' },
        { tone: 'Refuse', text: 'And if I don’t take it?', next: 'refuse' },
        { tone: 'Wait', text: '<em>(Say nothing.)</em>', next: null, hold: 1.2 },
      ],
    },
    whatisit: {
      who: 'Lou',
      line: 'It’s the thing you hope stays wrapped up. Take it.',
      cue: 'vo.bing.lou.brief.5',
      hold: 3.0,
    },
    refuse: {
      who: 'Lou',
      line: 'Then you go anyway and I worry the whole evening. Take it, Prospect.',
      hold: 3.4,
    },
    // Fired once the player picks the package up
    taken: {
      who: 'Lou',
      line: 'Comforting, isn’t it.',
      cue: 'vo.bing.lou.brief.6',
      hold: 2.2,
      next: 'envelope',
    },
    envelope: {
      who: 'Lou',
      line: '<em>(He slides an envelope across.)</em> Address. The room. Who you’re meeting, and when. '
        + 'You walk in calm. You sit down. You hear them out.',
      cue: 'vo.bing.lou.brief.7',
      enter: () => ctx.showEnvelope(),
      options: [
        { tone: 'Ask', text: 'And then?', next: 'andthen' },
        { tone: 'Take it', text: 'Fine.', next: 'questions' },
      ],
    },
    andthen: {
      who: 'Lou',
      line: 'Then you decide whether they’re wasting our time. That part’s yours. '
        + 'That’s why it’s you going and not one of the animals.',
      next: 'questions',
    },
    questions: {
      who: 'Lou',
      line: 'Anything else, or are we both going to sit here.',
      cue: 'vo.bing.lou.brief.8',
      options: () => [
        { tone: 'Contact', text: 'Who am I meeting?', next: 'contact', when: () => !ctx.asked.has('contact') },
        { tone: 'The package', text: 'Why give me this here?', next: 'why', when: () => !ctx.asked.has('why') },
        { tone: 'The lot', text: 'Somebody’s watching the club.', next: 'watched', when: () => ctx.flags.heardAboutCar || ctx.flags.sawCar },
        { tone: 'End it', text: 'I’ve got it.', next: 'end' },
      ],
    },
    contact: {
      who: 'Lou',
      line: 'Two of them. One talks, one doesn’t. The one who doesn’t is the one to watch, '
        + 'which I should not have to explain to a grown man.',
      enter: () => ctx.asked.add('contact'),
      next: 'questions',
    },
    why: {
      who: 'Lou',
      line: 'Because here it’s mine, and out there it’s evidence. '
        + 'And because I wanted to look at you before you went.',
      enter: () => ctx.asked.add('why'),
      next: 'questions',
    },
    watched: {
      who: 'Lou',
      line: '<em>(He turns the monitor round without hurrying.)</em> …Grey sedan. By the office wall. '
        + 'Alright. Find out whether it follows you. Don’t do anything about it. Find out.',
      enter: () => {
        ctx.asked.add('watched');
        ctx.flags.toldLou = true;
        mission.addObjective('tail', 'Find out whether the sedan follows you');
      },
      next: 'questions',
    },
    end: {
      who: 'Lou',
      line: '<em>(He goes back to the ledger.)</em> Go on, then.',
      cue: 'vo.bing.lou.brief.9',
      enter: () => mission.louDone(),
      hold: 2.6,
    },
    /* Called as you reach the door */
    parting: {
      who: 'Lou',
      line: 'Prospect. Don’t lose that playing blackjack.',
      cue: 'vo.bing.lou.brief.10',
      hold: 3.0,
    },
    /* The two lines the ledger recorded for Lou on his own floor. He is never
     * on the floor -- he runs the place from this office -- so they had no
     * home and had never been played. They are what he says once business is
     * done and you are still standing in his office. */
    hang: {
      who: 'Lou',
      line: 'There he is. My favorite errand with legs. You keepin’ your nose clean or just wipin’ it?',
      cue: 'vo.bing.hang.lou.1',
      options: [
        { tone: 'Reply', text: 'Clean. Mostly.', next: 'hang2' },
        { tone: 'Leave', text: 'I’m going, Lou.', next: null },
      ],
    },
    hang2: {
      who: 'Lou',
      line: 'Everything in this room I either bought, won, or forgave. Remember that when you want somethin’.',
      cue: 'vo.bing.hang.lou.2',
      hold: 3.6,
    },
    // Things he says without being spoken to
    doorOpen: { who: 'Lou', line: 'Close the door. We’re not selling raffle tickets.', hold: 2.6 },
    liquor: { who: 'Lou', line: 'You complete the errand first. Then you rob my bar.', hold: 2.8 },
    photos: { who: 'Lou', line: 'You here to pick up a package or review my decorating?', hold: 2.8 },
    inspecting: { who: 'Lou', line: 'It’s a gun, Prospect. Not an engagement ring.', hold: 2.8 },
    monitor: { who: 'Lou', line: 'Four cameras and none of them point at anything I care about.', hold: 2.8 },
    candy: { who: 'Lou', line: 'Take one. Everybody takes one. Nobody eats one.', hold: 2.6 },
    sat: { who: 'Lou', line: 'Good. Sitting. That’s progress.', hold: 2.2 },
  };

  /* ---------------------------------------------------------------- */
  /* Lou's associate, sent to fetch you off the table                  */
  /* ---------------------------------------------------------------- */
  const associate = {
    open: {
      who: "Lou's associate",
      line: 'Congratulations. You’ve discovered cards. Lou wants you.',
      options: [
        { tone: 'Go', text: 'I’m going.', next: null },
        { tone: 'Stall', text: 'One more hand.', next: 'no' },
      ],
    },
    no: {
      who: "Lou's associate",
      line: 'No. That’s not what that was. Come on.',
      hold: 2.6,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The DJ                                                            */
  /* ---------------------------------------------------------------- */
  const dj = {
    open: {
      who: 'DJ',
      line: () => (ctx.secondVisit?.()
        ? 'Back again. Alright — one request, and if Lou asks, you threatened me.'
        : 'You want a request? Because the answer’s no. Lou picks the records.'),
      options: () => (ctx.secondVisit?.()
        ? [
          { tone: 'Request', text: 'Something with horns. Loud.', next: 'horns', effect: () => ctx.request?.('horns') },
          { tone: 'Request', text: 'Anything by the Squatch.', next: 'squatch', effect: () => ctx.request?.('squatch') },
          { tone: 'Leave it', text: 'Fair enough.', next: null },
        ]
        : [
          { tone: 'Ask anyway', text: 'Anything by the Squatch?', next: 'squatch' },
          { tone: 'Leave it', text: 'Fair enough.', next: null },
        ]),
    },
    squatch: {
      who: 'DJ',
      line: 'That’s the one thing I would play. It’s in the crate. Lou says it’s "a lot".',
      hold: 3.0,
    },
    horns: {
      who: 'DJ',
      line: '<em>(He is already reaching for it.)</em> Horns. Everybody wants horns. '
        + 'Nobody wants the four minutes before the horns.',
      hold: 3.4,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The woman at the end of the bar                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Margo Salas, who is not here for anybody in this room.
   *
   * Kept deliberately light: this is a three-minute conversation whose only
   * mechanical output is whether he gave her his number, which is what makes
   * her ring on the afternoon of Day 3. Nothing here gates the Silver Room —
   * the campaign does that — so a player who walks straight past still gets
   * the date. What he loses is having met her first.
   */
  const margo = {
    open: {
      who: 'Margo',
      line: () => (ctx.flags.gotPackage
        ? '<em>(She does not look up from the glass.)</em> That was quick. Whatever it was.'
        : '<em>(She is watching the room rather than the stage, which in here is '
          + 'unusual enough to be conspicuous.)</em> You are going to say something. '
          + 'I can see it arriving.'),
      cue: () => (ctx.flags.gotPackage ? 'vo.bing.margo.1b' : 'vo.bing.margo.1'),
      enter: () => { ctx.flags.metHer = true; },
      options: [
        { tone: 'Deny it', text: 'I was going to walk past.', next: 'past' },
        { tone: 'Ask', text: 'What are you drinking?', next: 'drinking' },
        { tone: 'Leave it', text: '<em>(Walk past.)</em>', next: null },
      ],
    },
    past: {
      who: 'Margo',
      line: 'Nobody walks past this end. This end is where you sit when you are '
        + 'waiting for somebody and you have stopped enjoying it.',
      cue: 'vo.bing.margo.2',
      next: 'why',
    },
    drinking: {
      who: 'Margo',
      line: 'Rye. One ice cube. <em>(She tips the glass an inch.)</em> They brought three. '
        + 'I sent two back. It caused a scene.',
      cue: 'vo.bing.margo.3',
      enter: () => { ctx.flags.heardHerDrink = true; },
      next: 'why',
    },
    why: {
      who: 'Margo',
      line: 'I run the kitchen at the all-night place on Ashland. I am in here because '
        + 'my dishwasher’s brother works your door and he owes me two hundred dollars, '
        + 'and I have decided to be visible about it. Your turn.',
      cue: 'vo.bing.margo.4',
      options: [
        { tone: 'Ask', text: 'Let me buy you dinner.', next: 'dinner' },
        { tone: 'Offer', text: 'I could have a word about the two hundred.', next: 'word' },
        { tone: 'Leave it', text: 'Good luck with the two hundred.', next: null },
      ],
    },
    word: {
      who: 'Margo',
      line: '<em>(Sharply, and this is the most serious she gets all night.)</em> No. '
        + 'Absolutely not. I have watched what a word costs and I would rather have '
        + 'the two hundred outstanding forever. <em>(A beat, softer.)</em> '
        + 'But thank you for offering it like it was nothing.',
      options: [
        { tone: 'Ask', text: 'Then let me buy you dinner instead.', next: 'dinner' },
        { tone: 'Go', text: '<em>(Leave her to it.)</em>', next: null },
      ],
    },
    dinner: {
      who: 'Margo',
      line: '<em>(She looks at him properly for the first time, which takes a while.)</em> '
        + '…You ate at mine. Four in the morning, corner two. You tipped Hector. '
        + 'Nobody tips Hector — he is behind a wall, you would have had to go and find him.',
      cue: 'vo.bing.margo.5',
      options: [
        { tone: 'Number', text: 'Take my number. Ring it when you are not working.',
          next: 'number', effect: () => { ctx.flags.gaveNumber = true; } },
        { tone: 'Fold', text: 'That was the whole thing. That was all of it.', next: 'fold' },
      ],
    },
    number: {
      who: 'Margo',
      line: '<em>(She writes it on the back of a docket, which is what she has.)</em> '
        + 'I get one night off in six. If I use it on you and you are boring, '
        + 'I will be extremely unpleasant about it. <em>(Beat.)</em> I will ring.',
      cue: 'vo.bing.margo.6',
      hold: 4.6,
    },
    fold: {
      who: 'Margo',
      line: 'Hm. <em>(She goes back to the glass, but she is smiling at it.)</em> '
        + 'Shame. That was nearly something.',
      hold: 3.6,
    },
  };

  return {
    bouncer, bartender, hallGuard, security, dealer, lou, associate, dj, margo,
  };
}

/** Things patrons say as you go past. Never repeated back to back. */
export const AMBIENT = [
  ['a patron', 'You hear something happened with the butcher union?'],
  ['a patron', 'I don’t talk business near the coat check.'],
  ['a regular', 'Four hundred on a duck. A duck. In this economy.'],
  ['a regular', 'He says it’s a franchise. It’s a van.'],
  ['a waitress', 'You want a drink or you want the seat? Both is fine. Neither isn’t.'],
  ['a patron', 'They stopped doing the Sunday thing. Nobody said why.'],
  ['the contractor', 'One more hand and I’m going home. I mean it this time.'],
  ['a patron', 'That’s the prospect. Don’t look at him, you’ll set him off.'],
  ['a regular', 'Wednesday. Seven. Everybody keeps saying it like I’ve got a diary.'],
];

/** What the narrator says about the place, when nothing else is happening. */
export const NOTES = {
  lot: [
    'Rain, neon, and a lot full of cars belonging to men who are all in the same room.',
    'Somebody has parked very neatly, which around here is its own kind of suspicious.',
  ],
  vestibule: [
    'Bass through the wall. Somebody has hung a metal detector here and never plugged it in.',
  ],
  main: [
    'Warm, loud, and darker than it needs to be. Which is the idea.',
    'Every surface in here is either brass, leather, or somebody’s idea of marble.',
  ],
  hallway: [
    'The music goes muffled and the carpet gives up. This is where the club stops being a club.',
  ],
  bathroom: [
    'Somebody has written the whole roster on this wall. Two of them are spelled right.',
  ],
  storage: [
    'Kegs, boxes, a freezer, and a door with a light on it that says the alarm is awake.',
  ],
  office: [
    'Warm lamp, cold room. The clock is louder in here than the club is.',
  ],
};
