// ---------------------------------------------------------------------------
// Dialogue for THE JERKY MOTEL.
//
// Prospect never speaks on his own during a major exchange — the player picks
// a line from a four-slot wheel. Time slows while the wheel is up, but the
// world keeps running: everyone else keeps walking, blocking exits and getting
// into position.
//
// heat  — how nervous the sellers get (drives the betrayal)
// read  — how much Prospect works out about the room (unlocks cues + bonuses)
// ---------------------------------------------------------------------------

export const STYLES = ['calm', 'threat', 'insult', 'expert'];
export const STYLE_LABEL = { calm: 'CALM', threat: 'THREATENING', insult: 'INSULTING', expert: 'JERKY EXPERT' };

export const SNOW_GUN_HANDOFF = Object.freeze({
  offer: Object.freeze({
    speaker: 'Snow',
    line: 'Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.',
    seconds: 5.4,
  }),
  transfer: Object.freeze({
    speaker: 'Prospect',
    line: 'It is under my coat. It stays under my coat.',
    seconds: 3.0,
  }),
});

/* The room earns the inspection controls through a complete spoken exchange.
 * These are exact existing catalog lines, arranged as one immutable sequence
 * for the shared dialogue floor to play before the sample becomes usable. */
export const ROOM_ENTRY_BEATS = Object.freeze([
  Object.freeze({
    speaker: 'Chino',
    line: 'Door stays shut. Air conditioning.',
    seconds: 3.0,
    leadSeconds: 0.5,
  }),
  Object.freeze({
    speaker: 'Rico',
    line: 'Mountain reserve. Eleven-year cure. No fillers.',
    seconds: 4.0,
    leadSeconds: 0.65,
  }),
  Object.freeze({
    speaker: 'Prospect',
    line: 'Eight in their case. One on the table. Neither of them is mine yet.',
    seconds: 3.6,
    leadSeconds: 0.7,
  }),
  Object.freeze({
    speaker: 'Rico',
    line: 'Meat first. Money second. That is how this works.',
    seconds: 3.6,
    leadSeconds: 0.75,
  }),
]);

/* Seller turns that can answer Tony's physical inspection without inventing a
 * second speech system. Every sentence already belongs to the Motel voice
 * catalog; `leadSeconds` gives the preceding inspection line room to land
 * before the existing dialogue floor starts the response. */
export const INSPECTION_MEETING_BEATS = Object.freeze({
  smell: Object.freeze([
    Object.freeze({ speaker: 'Rico', line: 'I told you.', seconds: 2.4, leadSeconds: 0.55 }),
  ]),
  grain: Object.freeze([
    Object.freeze({ speaker: 'Chino', line: 'Rico. He is asking who handled it.', seconds: 3.0, leadSeconds: 0.65 }),
    Object.freeze({ speaker: 'Rico', line: 'Nobody handled it. It handles itself.', seconds: 3.2, leadSeconds: 0.55 }),
  ]),
  taste: Object.freeze([
    Object.freeze({ speaker: 'Chino', line: 'No refunds once you chew.', seconds: 2.8, leadSeconds: 0.65 }),
  ]),
  reference: Object.freeze([
    Object.freeze({ speaker: 'Chino', line: 'You buying or writing a cookbook?', seconds: 3.0, leadSeconds: 0.7 }),
  ]),
  scan: Object.freeze([
    Object.freeze({ speaker: 'Rico', line: 'This is not gas-station product.', seconds: 3.0, leadSeconds: 0.75 }),
  ]),
});

export const NODES = {
  // --- in the car, before you ever open a door ---
  snowBrief: {
    speaker: 'Snow',
    line: 'Room twelve. Meat first. Money second.',
    options: {
      calm: { text: 'That is how business works.', heat: 0, read: 2, reply: ['Snow', 'Good. Business. Not opera.'] },
      threat: { text: 'If they waste my time, they lose more than jerky.', heat: 2, read: 1, reply: ['Snow', 'Buy. Leave. No speeches.'] },
      insult: { text: 'This motel smells like boiled carpet.', heat: 0, read: 1, reply: ['Snow', 'The pool. Nobody drained it since the eighties.'] },
      expert: { text: 'If the grain runs sideways, we walk.', heat: 0, read: 5, reply: ['Snow', 'Grain runs sideways, I am driving.'] },
    },
  },

  // --- at the door of room twelve ---
  atDoor: {
    speaker: 'Rico',
    line: 'You Prospect?',
    options: {
      calm: { text: 'You Rico?', heat: 0, read: 2, reply: ['Rico', 'Depends who is asking about meat at this hour.'] },
      threat: { text: 'Open the door.', heat: 6, read: 1, reply: ['Rico', 'Relax, big man. Doors open easier when nobody yells at them.'] },
      insult: { text: 'No, I am motel inspection.', heat: 4, read: 2, reply: ['Rico', 'Funny. Inspectors do not have that much fur.'] },
      expert: { text: 'Depends what is in the suitcase.', heat: 2, read: 5, reply: ['Rico', 'What is in the suitcase is history. Come inside before the neighbours smell it.'] },
    },
  },

  // --- the sample, after the first sniff ---
  sample: {
    speaker: 'Rico',
    line: 'Mountain reserve. Eleven-year cure. No fillers.',
    prospect: ['Prospect', 'This smoke is real.'],
    prospect2: ['Prospect', 'I did not say the meat was real.'],
    chino: ['Chino', 'You buying or writing a cookbook?'],
    options: {
      calm: { text: 'Show me the full case.', heat: 2, read: 3, reply: ['Rico', 'The whole case. Nothing to hide in a case.'] },
      threat: { text: 'Do not rush me near meat.', heat: 7, read: 2, reply: ['Chino', 'Nobody is rushing. I am just standing here. By the door.'] },
      insult: { text: 'I have eaten belts with better texture.', heat: 9, read: 3, reply: ['Rico', 'Belts. He says belts. In my room.'] },
      expert: { text: 'This was cut against the grain. Who handled it?', heat: 12, read: 9, reply: ['Rico', 'Nobody handled it. It handles itself.'], nervous: true },
    },
  },

  // --- once you have proof the product is fake ---
  counterfeit: {
    speaker: 'Prospect',
    line: 'This is gas-station product with the logo scraped off.',
    options: {
      calm: { text: 'Bring out the real case and we forget this.', heat: 10, read: 4, reply: ['Rico', 'There is no other case. There is this case.'], demandStash: true },
      threat: { text: 'You sold me a lie in a wrapper. Fix it.', heat: 22, read: 3, reply: ['Chino', 'Rico. He knows.'], demandStash: true },
      insult: { text: 'Eleven-year cure. It has a barcode from last April.', heat: 16, read: 6, reply: ['Rico', 'Barcodes get printed. Meat gets born.'], demandStash: true },
      expert: { text: 'Sugar glaze, uniform strips, no butcher stamp. Room eleven, then.', heat: 14, read: 12, reply: ['Rico', '...Who told you about eleven?'], demandStash: true, revealStash: true },
    },
  },

  // --- Rico's quiet offer, if the room has not gone bad yet ---
  ricoOffer: {
    speaker: 'Rico',
    line: 'Your driver takes forty of your money for parking a car. Walk out with me instead. You keep the case, I keep the cash, he keeps the parking.',
    options: {
      calm: { text: 'Snow stays. Say the next part carefully.', heat: 6, read: 6, reply: ['Rico', 'The next part is the part where you decide.'] },
      threat: { text: 'Say his name again and I use the vacuum sealer on you.', heat: 18, read: 4, reply: ['Rico', 'Noted. Loudly.'] },
      insult: { text: 'You are the third best liar in this room and there are three of us.', heat: 14, read: 8, reply: ['Rico', 'Three. He counted three.'], hintsThird: true },
      expert: { text: 'A man with real product does not need a partner. Deal.', heat: 4, read: 4, reply: ['Rico', 'Now that is business.'], betrayAlly: true },
    },
  },

  // --- in the car afterwards ---
  getaway: {
    speaker: 'Snow',
    line: 'Tell me that was worth it.',
    options: {
      calm: { text: 'It is real.', heat: 0, read: 0, reply: ['Snow', 'Then we are rich. I am still shaking.'] },
      threat: { text: 'Drive before I inspect you.', heat: 0, read: 0, reply: ['Snow', 'Driving. Driving.'] },
      insult: { text: 'You parked facing the building.', heat: 0, read: 0, reply: ['Snow', 'I parked facing the exit. Mostly.'] },
      expert: { text: 'Humidity touched the bottom packages.', heat: 0, read: 0, reply: ['Snow', 'Humidity touched everything tonight.'] },
    },
  },
};

// Ambient one-liners. The sellers keep talking while you walk around the room.
export const SELLER_BARKS = [
  ['Rico', 'Do not touch that package.'],
  ['Rico', 'That batch crossed three state lines.'],
  ['Chino', 'You think rare meat grows on trees?'],
  ['Rico', 'The cattle had names.'],
  ['Rico', 'This is not gas-station product.'],
  ['Chino', 'No refunds once you chew.'],
  ['Chino', 'Stand where I can see you.'],
  ['Chino', 'Rico. Why is he so tall. Rico.'],
  ['Rico', 'In this room we are all the same size.'],
  ['Rico', 'Do not lean on that. It is a wall, but only technically.'],
  ['Rico', 'Seventy-two hours of smoke. Seventy-two.'],
  ['Chino', 'The gloves are for hygiene.'],
  ['Rico', 'Government took the herd. Government did not take everything.'],
];

export const PROSPECT_BARKS = [
  'I can smell preservatives.',
  'This room is too warm.',
  'You stored this near fish.',
  'Nobody locks a door during honest jerky.',
  'You people do not respect the cure.',
  'This strip has been folded.',
  'Silver is cheaper than this and silver does not spoil.',
  'I have to duck in your doorway. Think about what that means for you.',
  'Everyone in this room is smaller than the deal.',
];

export const SNOW_BARKS = [
  'Buy the meat. Leave. No speeches.',
  'Second car. Running. Nobody in it.',
  'The upstairs. Somebody keeps not looking at me.',
  'Two minutes. Then I honk.',
  'One package? Ask for the case.',
];

// Combat / escape shouts.
export const FIGHT_BARKS = [
  ['Rico', 'Bring out the cutting board!'],
  ['Chino', 'Get the case! Get the case!'],
  ['Bathroom Seller', 'Hold him still!'],
  ['Rico', 'Not the product! Anything but the product!'],
  ['Chino', 'He is too big! Somebody find the prod!'],
];

export const SNOW_FIGHT_BARKS = [
  'Which case is ours?',
  'Coming in. Do not swing.',
  'Car is running! Move!',
  'Pool side!',
];

/* Deprecated aliases. `tools/sound-queue.mjs` still imports the old names and
 * is owned elsewhere; these keep it running until it is updated to say Snow. */
export const MANNY_BARKS = SNOW_BARKS;
export const MANNY_FIGHT_BARKS = SNOW_FIGHT_BARKS;

// The closing exchange on the road.
export const ENDING = [
  ['Snow', 'How much survived?'],
  ['*', 'Prospect opens the case.'],
  ['Snow', 'Well?'],
  ['Prospect', 'Too much pepper.'],
];
