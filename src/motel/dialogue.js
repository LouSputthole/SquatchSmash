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

export const NODES = {
  // --- in the car, before you ever open a door ---
  mannyBrief: {
    speaker: 'Manny',
    line: 'Room twelve. They show the meat first. You show the money second.',
    options: {
      calm: { text: 'That is how business works.', heat: 0, read: 2, reply: ['Manny', 'Good. Business. Not opera.'] },
      threat: { text: 'If they waste my time, they lose more than jerky.', heat: 2, read: 1, reply: ['Manny', 'Prospect. We buy the meat, we leave. No speeches.'] },
      insult: { text: 'This motel smells like boiled carpet.', heat: 0, read: 1, reply: ['Manny', 'That is the pool. Nobody has drained it since the eighties.'] },
      expert: { text: 'If the grain runs sideways, we walk.', heat: 0, read: 5, reply: ['Manny', 'If the grain runs sideways I am already driving.'] },
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
      calm: { text: 'Manny stays. Say the next part carefully.', heat: 6, read: 6, reply: ['Rico', 'The next part is the part where you decide.'] },
      threat: { text: 'Say his name again and I use the vacuum sealer on you.', heat: 18, read: 4, reply: ['Rico', 'Noted. Loudly.'] },
      insult: { text: 'You are the third best liar in this room and there are three of us.', heat: 14, read: 8, reply: ['Rico', 'Three. He counted three.'], hintsThird: true },
      expert: { text: 'A man with real product does not need a partner. Deal.', heat: 4, read: 4, reply: ['Rico', 'Now that is business.'], betrayManny: true },
    },
  },

  // --- in the car afterwards ---
  getaway: {
    speaker: 'Manny',
    line: 'Tell me that was worth it.',
    options: {
      calm: { text: 'It is real.', heat: 0, read: 0, reply: ['Manny', 'Then we are rich and I am shaking for no reason.'] },
      threat: { text: 'Drive before I inspect you.', heat: 0, read: 0, reply: ['Manny', 'Driving. Driving.'] },
      insult: { text: 'You parked facing the building.', heat: 0, read: 0, reply: ['Manny', 'I parked facing the exit. The building was an accident.'] },
      expert: { text: 'Humidity touched the bottom packages.', heat: 0, read: 0, reply: ['Manny', 'Humidity touched all of us tonight.'] },
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
];

export const MANNY_BARKS = [
  'Prospect, we buy the meat, we leave. No speeches.',
  'There is a second car running out here. Nobody is in the front seat.',
  'I do not like the upstairs. Somebody keeps not looking at me.',
  'Two minutes and I start honking.',
  'If they show you one package, ask for the case.',
];

// Combat / escape shouts.
export const FIGHT_BARKS = [
  ['Rico', 'Bring out the cutting board!'],
  ['Chino', 'Get the case! Get the case!'],
  ['Bathroom Seller', 'Hold him still!'],
  ['Rico', 'Not the product! Anything but the product!'],
  ['Chino', 'He is too big! Somebody find the prod!'],
];

export const MANNY_FIGHT_BARKS = [
  'Which case is ours?',
  'I am coming in! Do not swing at me!',
  'Car is running! Move!',
  'They came from the pool side!',
];

// The closing exchange on the road.
export const ENDING = [
  ['Manny', 'How much of it survived?'],
  ['*', 'Prospect opens the case.'],
  ['Manny', 'Well?'],
  ['Prospect', 'Too much pepper.'],
];
