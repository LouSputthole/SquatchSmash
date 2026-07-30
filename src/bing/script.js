/**
 * Everything anybody says in the Bing.
 *
 * Kept out of the systems the way the radio's writing is kept out of the
 * radio: this file is the script, dialogue.js is the machine that plays it,
 * and neither has to know much about the other. Nodes may read the mission
 * state, so a man who has been kept waiting eleven minutes greets you
 * differently from a man who has been kept waiting eleven seconds.
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
    done: {
      who: 'Bouncer',
      line: 'He’s in the back. Don’t make me come find you.',
      enter: () => { ctx.flags.bouncerCleared = true; },
      hold: 2.4,
    },
    returning: {
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
      line: 'So. What are we doing.',
      options: [
        { tone: 'Club soda', text: 'Club soda. I’m working.', next: 'soda', effect: () => ctx.order('soda') },
        { tone: 'Beer', text: 'Beer.', next: 'pour', effect: () => ctx.order('beer') },
        { tone: 'Whiskey', text: 'Whiskey. Neat.', next: 'pour', effect: () => ctx.order('whiskey') },
        { tone: 'Coffee', text: 'Whatever Lou drinks.', next: 'lou-drink', effect: () => ctx.order('coffee') },
      ],
    },
    soda: {
      who: 'Bartender',
      line: 'Club soda. There you go. Big night.',
      hold: 2.4,
    },
    pour: {
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
    /* He does not look up straight away. That is the whole character. */
    enter: {
      who: 'Lou',
      line: () => {
        const w = mission.waited;
        if (w > 8 * 60) return '<em>(He does not look up.)</em> Sit down. Or don’t. You’ve had all night to decide.';
        if (w > 5 * 60) return '<em>(He does not look up.)</em> There he is.';
        return '<em>(He keeps writing for a moment.)</em> Shut the door.';
      },
      hold: 3.0,
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
      enter: () => ctx.showParcel(),
      hold: 3.6,
      next: 'waiting',
    },
    waiting: {
      who: 'Lou',
      line: () => 'It’s not going to walk over to you.',
      options: [
        { tone: 'Ask', text: 'What is it?', next: 'whatisit' },
        { tone: 'Refuse', text: 'And if I don’t take it?', next: 'refuse' },
        { tone: 'Wait', text: '<em>(Say nothing.)</em>', next: null, hold: 1.2 },
      ],
    },
    whatisit: {
      who: 'Lou',
      line: 'It’s the thing you hope stays wrapped up. Take it.',
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
      hold: 2.2,
      next: 'envelope',
    },
    envelope: {
      who: 'Lou',
      line: '<em>(He slides an envelope across.)</em> Address. The room. Who you’re meeting, and when. '
        + 'You walk in calm. You sit down. You hear them out.',
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
      enter: () => mission.louDone(),
      hold: 2.6,
    },
    /* Called as you reach the door */
    parting: {
      who: 'Lou',
      line: 'Prospect. Don’t lose that playing blackjack.',
      hold: 3.0,
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
      line: 'You want a request? Because the answer’s no. Lou picks the records.',
      options: [
        { tone: 'Ask anyway', text: 'Anything by the Squatch?', next: 'squatch' },
        { tone: 'Leave it', text: 'Fair enough.', next: null },
      ],
    },
    squatch: {
      who: 'DJ',
      line: 'That’s the one thing I would play. It’s in the crate. Lou says it’s "a lot".',
      hold: 3.0,
    },
  };

  /* ---------------------------------------------------------------- */
  /* The woman at the end of the bar                                   */
  /* ---------------------------------------------------------------- */

  const delia = {
    open: {
      who: 'Delia',
      line: () => (ctx.flags.gotPackage
        ? '<em>(She does not look up from the glass.)</em> That was quick. Whatever it was.'
        : '<em>(She is watching the room rather than the stage, which is unusual in here.)</em> '
          + 'You are going to say something. I can see it arriving.'),
      options: [
        { tone: 'Deny it', text: 'I was going to walk past.', next: 'past' },
        { tone: 'Ask', text: 'What are you drinking?', next: 'drinking' },
        { tone: 'Recognise her', text: '…Two in the morning. You were being a bus.', next: 'bus' },
        { tone: 'Leave it', text: '<em>(Walk past.)</em>', next: null },
      ],
    },
    past: {
      who: 'Delia',
      line: 'Nobody walks past this end. This end is where you sit when you have '
        + 'had enough of everybody.',
      next: 'why',
    },
    drinking: {
      who: 'Delia',
      line: 'Rye. One ice cube. <em>(She tips the glass an inch.)</em> They brought three. '
        + 'I sent two back. It caused a scene.',
      enter: () => ctx.flags && (ctx.flags.heardHerDrink = true),
      next: 'why',
    },
    bus: {
      who: 'Delia',
      line: '<em>(She puts the glass down and turns round properly, which she has not '
        + 'done for anybody tonight.)</em> …You are the one who rang in about the desk.',
      next: 'desk',
    },
    desk: {
      who: 'Delia',
      line: 'Four years. Nobody has ever asked about the desk. '
        + '<em>(Beat.)</em> Right. Say the next thing. Go on.',
      options: [
        { tone: 'Ask', text: 'Let me buy you dinner.', next: 'dinner' },
        { tone: 'Ask', text: 'What are you doing after two?', next: 'after' },
        { tone: 'Fold', text: 'That was the next thing. That was all of it.', next: 'fold' },
      ],
    },
    why: {
      who: 'Delia',
      line: 'I do a show upstairs from what used to be my dad\u2019s shop. I finish at two '
        + 'and I wait here for a cab because the cabs know this address. '
        + 'That is the whole story. Your turn.',
      options: [
        { tone: 'Ask', text: 'Let me buy you dinner.', next: 'dinner' },
        { tone: 'Ask', text: 'What are you doing after two?', next: 'after' },
        { tone: 'Leave it', text: 'Enjoy your cab.', next: null },
      ],
    },
    dinner: {
      who: 'Delia',
      line: 'Dinner. <em>(She looks at you for slightly longer than is comfortable, '
        + 'which is a thing you are going to get used to.)</em> Give me a number. '
        + 'I am not committing to anything. I might ring.',
      enter: () => { ctx.flags.gaveNumber = true; mission.note('You gave somebody your number, which is not a thing you do.'); },
      next: 'number',
    },
    after: {
      who: 'Delia',
      line: 'After two I am asleep, and I do not want to hear the rest of that sentence. '
        + '<em>(Beat.)</em> …Ask me the other way.',
      next: 'why',
    },
    number: {
      who: 'Delia',
      line: '<em>(She writes it on the back of a coaster and puts the coaster in her bag '
        + 'rather than her pocket, which means she is keeping it.)</em> Go on. He is waiting '
        + 'for you and everybody in here knows it.',
      hold: 5.2,
    },
    fold: {
      who: 'Delia',
      line: 'Honest. Rare. <em>(She turns back to the glass.)</em> Come and find me when '
        + 'you have thought of one.',
      hold: 4.2,
    },
  };

  return { bouncer, bartender, hallGuard, security, dealer, lou, associate, dj, delia };
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
