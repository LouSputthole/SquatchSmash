/**
 * Everything anybody says on the Beef Run.
 *
 * Lines are data, the way the apartment's radio scripts are data: a beat is an
 * ordered list of {who, text, hold}, and the mission plays a beat by id. `hold`
 * is how long the line sits on screen before the next one starts, in seconds —
 * dialogue is not gated on an audio clip existing, so the mission plays at the
 * same pace whether or not anybody has recorded it.
 *
 * `who` is one of: SASOLE, PROSPECT, CECILIO, STOVE, CAIB, LOOKOUT, ASSOCIATE.
 *
 * SASOLE is Captain Lou Sasole — the stable campaign character
 * `captain_lou_sasole`, a different person from Big Uncle Lou at the Bing.
 * An explicit `voice` names the manifest voice profile; speakers without one
 * derive it from their display name (see tools/beefrun-vo.mjs).
 */

export const SPEAKERS = {
  SASOLE: { name: 'CAPTAIN LOU SASOLE', colour: '#e8c86a', voice: 'lou2' },
  PROSPECT: { name: 'PROSPECT', colour: '#cfd4e0', voice: 'player' },
  CECILIO: { name: 'CECILIO', colour: '#d98a5a' },
  STOVE: { name: 'OLD STOVE', colour: '#8fc4a8' },
  CAIB: { name: 'CAIB RADIO', colour: '#8ab4d9' },
  LOOKOUT: { name: 'LOOKOUT', colour: '#a8b48a' },
  ASSOCIATE: { name: 'SQUATCH ASSOCIATE', colour: '#b49ad9' },
};

const L = (text, hold) => ({ who: 'SASOLE', text, hold });
const P = (text, hold) => ({ who: 'PROSPECT', text, hold });
const C = (text, hold) => ({ who: 'CECILIO', text, hold });
const S = (text, hold) => ({ who: 'STOVE', text, hold });
const R = (text, hold) => ({ who: 'CAIB', text, hold });

export const BEATS = {
  /* ---------------- Whispering Pines ---------------- */

  greeting: [
    L('You’re late.', 1.9),
    P('I’m four minutes early.', 2.0),
    L('Then you wasted four minutes somewhere.', 2.6),
  ],

  aircraft: [
    L('This is the Brushrunner. She pulls left, leaks right, and the fuel gauge is an optimist.', 4.6),
    P('You said I was helping load.', 2.2),
    L('You are. After you fly us there.', 2.6),
    P('You look terrible.', 2.0),
    L('I ate airport sushi.', 2.2),
    P('This airport has sushi?', 2.1),
    L('Not anymore.', 2.4),
  ],

  clipboard: [
    L('Preflight. Walk round her and touch everything I tell you to.', 3.6),
    L('If something falls off while you’re holding it, that’s information.', 3.4),
  ],

  /* ---------------- CIA Stove ---------------- */

  'stove.meet': [
    S('Morning. I’m not here.', 2.4),
    P('You’re standing right there.', 2.2),
    S('I’m standing somewhere I have not been.', 3.0),
    L('That’s Old Stove. He’s family.', 2.6),
    P('And the windbreaker?', 2.0),
    L('He’s also the government.', 2.4),
    P('Which government?', 1.8),
    L('Ours. Allegedly.', 2.4),
  ],

  'stove.crates': [
    S('Three crates. They go where you’re going.', 3.2),
    P('What’s in them?', 1.8),
    S('Agricultural equipment.', 2.2),
    P('They’re heavy for agricultural equipment.', 2.6),
    S('It’s very good agricultural equipment.', 3.0),
  ],

  'stove.dontask': [
    P('Are they what I think they are?', 2.4),
    S('They’re what the paperwork says they are.', 2.8),
    P('What does the paperwork say?', 2.2),
    S('There is no paperwork.', 2.6),
    L('Load the crates.', 2.0),
  ],

  'stove.loading': [
    L('Same three positions. His are lighter than what we’re bringing back.', 4.4),
    S('They are also more difficult to explain, so mind the door frame.', 4.2),
  ],

  'stove.done': [
    S('Cecilio will count them. He counts everything.', 3.4),
    S('If anyone asks, this airfield has no windsock and I have no face.', 4.4),
    L('He does this every time.', 2.4),
  ],

  /* ---------------- Handing them over ---------------- */

  'guns.arrive': [
    C('Old Stove sent his equipment.', 2.6),
    L('He sends his regards. He does not send his name.', 3.4),
  ],

  'guns.unloading': [
    L('Get his crates out first. The jerky does not share the aeroplane.', 4.4),
    P('Why not?', 1.6),
    L('Because one of them is worth more, and it isn’t the metal.', 4.0),
  ],

  'guns.done': [
    C('(weighing a crate) Tractor parts.', 2.8),
    L('Tractor parts.', 2.0),
    C('Now. The important cargo.', 2.6),
  ],

  /* ---------------- Preflight prompts ---------------- */

  'preflight.chocks': [L('Unless you plan on taking the runway with us, lose the blocks.', 3.6)],
  'preflight.chocks.done': [L('Two of them. There are always two.', 2.4)],
  'preflight.caps': [L('Fuel staying inside the plane is one of aviation’s better traditions.', 4.0)],
  'preflight.caps.loose': [L('That one’s loose. Turn it till it argues back.', 3.0)],
  'preflight.props': [
    P('This blade is chipped.', 2.0),
    L('So is my front tooth. We both still work.', 3.0),
  ],
  'preflight.drain': [
    L('Drain a cup off each side. If it’s cloudy there’s water in it.', 4.0),
    L('Hold it open. Let go when it runs clear.', 3.0),
  ],
  'preflight.drain.cloudy': [
    P('It’s cloudy.', 1.6),
    L('That’s the airport’s fault, the fuel’s fault, and eventually ours.', 3.6),
    L('Again.', 1.6),
  ],
  'preflight.drain.clear': [L('Clear. Now we’re only carrying the usual problems.', 3.2)],
  'preflight.door': [L('The cargo door. Turn the handle until you hear the aeroplane agree.', 3.8)],
  'preflight.surfaces': [
    L('Move the elevator and the rudder. Watch them move.', 3.2),
    L('Up makes the houses smaller. Down makes them bigger. Don’t let them get too big.', 4.6),
  ],
  'preflight.done': [
    L('That’s a preflight. Get in.', 2.4),
    L('I’ll take the right seat. Slowly.', 2.6),
  ],

  /* ---------------- Startup and taxi ---------------- */

  'start.begin': [
    L('Battery. Fuel selectors. Crack both throttles about an inch.', 4.2),
    L('Then left engine. Then right. In that order, for reasons.', 3.8),
  ],
  'start.leftRunning': [L('There’s one.', 1.8)],
  'start.rightBalk': [
    L('She likes commitment.', 2.2),
    L('Again.', 1.4),
  ],
  'start.rightCatch': [L('There she is.', 2.0)],
  'start.brake': [L('Parking brake off. Gently. They’re more of a written suggestion.', 4.0)],

  'lineup.begin': [
    L('Run-up is good. Follow the arrow onto runway eighteen, point the nose south, then stop on the centerline.', 5.4),
  ],
  'lineup.ready': [
    L('There. Centerline under your nose. Full power when you are ready; at sixty, ease her off.', 4.8),
  ],

  'taxi.route': [
    L('Follow the faded yellow line out of the apron. It jogs right to the double bars at runway eighteen.', 5.4),
  ],
  'taxi.begin': [
    L('Taxi out. Little bursts of power, then let her roll.', 3.6),
    L('She doesn’t steer like a truck. She steers like an argument.', 3.8),
  ],
  'taxi.fast': [L('Slow down. We’re not late for anything that matters.', 3.4)],
  'taxi.hold': [
    L('Hold here. Feet on the brakes, run them both up.', 3.6),
  ],
  'runup.sputter': [
    P('Did that fix it?', 1.8),
    L('It changed the situation.', 2.6),
  ],
  'runup.done': [L('Good enough. Line up.', 2.2)],

  /* ---------------- Takeoff ---------------- */

  'takeoff.brief': [
    L('Full power. Keep it straight. At sixty, pull back gently.', 4.2),
    P('What happens at sixty?', 2.0),
    L('We find out if I remembered the number.', 3.0),
  ],
  'takeoff.rotate': [L('That’s sixty. Ease her off.', 2.4)],
  'takeoff.trees': [L('Trees. Trees are the last part of the runway nobody paves.', 3.6)],
  'takeoff.clear': [
    L('Congratulations. You have now flown exactly far enough to be blamed.', 4.4),
  ],
  'takeoff.fly': [
    L('Let me hear you fly.', 2.0),
    L('You are piping hot right now. El Hueso is south; keep the white diamond and compass arrow centered.', 5.4),
  ],
  // Spelled for Captain Sasole's delivery rather than formal orthography: he
  // draws both words out after Tony gets the old Brushrunner airborne.
  'takeoff.okay': [L('Ohhhh kay.', 2.0)],
  'takeoff.grass': [
    L('That’s the grass. The grass is not the runway.', 3.2),
    L('Bring her back round and do it with more conviction.', 3.4),
  ],

  /* ---------------- Southbound ---------------- */

  'cruise.what': [
    P('What exactly are we picking up?', 2.4),
    L('Beef jerky.', 1.8),
    P('That’s it?', 1.6),
    L('Rare beef jerky.', 2.0),
    P('How rare?', 1.6),
    L('Possession is a customs event.', 2.8),
  ],

  'cruise.photo': [
    L('This is mountain-cured, pepper-crusted Silverback Reserve. Every strip has a serial number.', 5.2),
    P('Why is it illegal?', 2.0),
    L('Trade agreement. Agricultural rules. Three senators own competing smokehouses. Pick a villain.', 5.4),
  ],

  'nav.tower': [L('Broken tower on the nose. Keep it off your left wing and hold what you’ve got.', 4.6)],
  'nav.river': [L('River bent like a horseshoe. Follow the open end.', 3.4)],
  'nav.volcano': [L('Volcano. Don’t fly through the smoke, it’s rude.', 3.2)],
  'nav.cliff': [L('Red cliff. After that it’s all jungle and bad ideas.', 3.6)],

  'turb.start': [
    L('Air’s getting lumpy. That’s the mountains breathing.', 3.6),
  ],
  'turb.sick': [
    L('I need you to fly smoother.', 2.4),
    P('I don’t know how.', 2.0),
    L('Then learn before my shirt becomes evidence.', 3.4),
  ],
  'turb.bag': [L('There are receipts in the sick bag. I’m putting it back.', 3.6)],

  /* ---------------- Approach to El Hueso ---------------- */

  'approach.falls': [
    L('See that waterfall?', 2.0),
    P('Yes.', 1.2),
    L('Fly toward it.', 1.8),
    P('There’s a mountain behind it.', 2.2),
    L('The runway is before the mountain.', 2.6),
    P('That feels important.', 2.2),
  ],
  'approach.valley': [
    L('Down into the valley. Power back, flaps out, and pick your line early.', 4.6),
    L('You get one. There is no going round again in here.', 3.6),
  ],
  'approach.high': [L('Too high.', 1.4)],
  'approach.high2': [L('Still too high.', 1.6)],
  'approach.high3': [L('Now you’re proving a point.', 2.2)],
  'approach.low': [L('Low. Add power before the trees do it for you.', 3.0)],
  'approach.slow': [L('Power. Power. POWER.', 2.2)],
  'approach.fast': [L('We’re landing here, not in the next country.', 3.0)],
  'approach.flare': [L('Hold it off. Hold it. Let her sit down.', 3.0)],

  'landing.good': [
    L('That was a landing. I want that noted somewhere.', 3.4),
  ],
  'landing.rough': [
    L('We arrived before the important pieces fell off. Count it.', 4.0),
  ],
  'landing.bad': [
    L('Some of that was flying.', 2.4),
    L('Shut it down before anything else agrees to come off.', 3.4),
  ],

  /* ---------------- The loading ---------------- */

  'cecilio.meet': [
    C('Grass-fed. Cold-smoked. Forty-two days in mountain air.', 4.4),
    P('It looks like jerky.', 2.2),
  ],
  'cecilio.silence': [
    L('He’s new.', 1.8),
    C('This is not gas-station meat.', 2.6),
    P('Understood.', 1.6),
    C('This jerky has lineage.', 2.8),
  ],
  'load.brief': [
    L('Three crates. Three positions. One in each and she flies like an aeroplane.', 4.6),
    L('All three in the back and she flies like a seesaw.', 3.4),
  ],
  'load.tail': [
    L('Move one forward unless you want the plane climbing before the runway starts.', 4.8),
  ],
  'load.nose': [
    L('We’re hauling jerky, not trying to drill for oil with the nose.', 4.2),
  ],
  'load.strap': [L('Strap them. Loose cargo is just weight that gets a vote.', 4.0)],
  'load.done': [L('Door shut and latched. Say it out loud so I hear you say it.', 4.0)],

  /* ---------------- The departure ---------------- */

  'depart.engine': [
    { who: 'LOOKOUT', text: '(radio, urgent) Motor. Two valleys over, coming this way.', hold: 3.6 },
    C('Aeroplane. Bureau. Go now.', 2.6),
  ],
  'depart.lou': [
    L('You’re flying back.', 2.2),
    P('I barely landed.', 2.0),
    L('And now you’re experienced.', 2.6),
  ],
  'depart.seat': [
    L('Wake me if an engine quits.', 2.6),
    P('Which engine?', 1.8),
    L('The loud one.', 2.2),
  ],
  'depart.downhill': [
    L('Downhill. The arrow on the barrel is not decoration.', 3.8),
    L('Keep it rolling.', 2.0),
  ],
  'depart.runway': [
    P('We’re running out of runway.', 2.4),
    L('Then stop looking at it.', 2.6),
  ],
  'depart.clear': [L('Cliff. That’s the good kind of nothing underneath you.', 3.6)],

  /* ---------------- Homebound ---------------- */

  'return.river': [
    L('Stay near the river.', 2.2),
    P('Why?', 1.2),
    L('Because rivers rarely build towers.', 2.8),
  ],
  'return.ridge': [
    L('Ridge ahead. Left side.', 2.4),
    P('The left side has trees.', 2.2),
    L('The right side has government.', 2.8),
  ],
  'return.rain': [L('Rain. Good. Nobody looks up in it.', 3.0)],

  'caib.sweep': [
    R('...sector four, negative contact, continuing the pattern.', 3.6),
    L('They’re sweeping. Get lower.', 2.6),
  ],
  'caib.hail': [
    R('Unidentified cargo aircraft, alter course and prepare for agricultural inspection.', 5.0),
    L('Do not answer.', 2.0),
    P('They know we’re here.', 2.2),
    L('Knowing and proving are cousins, not twins.', 3.4),
  ],
  'caib.chase': [
    L('Behind us. Don’t climb — climbing is how you introduce yourself.', 4.4),
    L('Canyon, cloud, or the saddle in that ridge. Pick one and commit.', 4.2),
  ],
  'caib.lost': [
    L('Gone. Or bored. Both spend the same.', 3.0),
  ],
  'caib.boundary': [
    L('That range behind us is the whole argument. We’re somebody else’s paperwork now.', 5.0),
  ],

  /* ---------------- The left engine ---------------- */

  'engine.hot': [
    L('Left one’s running hot. Ease back the left throttle.', 3.8),
    P('We need both engines.', 2.2),
    L('That is why the plane came with two.', 3.0),
  ],
  'engine.cooling': [L('Let it sulk. Fly the other one.', 2.8)],
  'engine.recovered': [L('Temperature’s down. Give it half and don’t apologise to it.', 4.0)],

  /* ---------------- Home ---------------- */

  'home.sight': [
    L('That’s the field. Same as you left it, which is the best it does.', 4.2),
    P('The runway lights are out.', 2.2),
    L('They have been out since the county discovered invoices.', 3.8),
    P('How do I see the runway?', 2.2),
  ],
  'home.headlights': [
    L('Community support.', 2.2),
  ],
  'home.final': [
    L('Crosswind from the left. Point the nose into it and land on the wheel that’s low.', 5.0),
  ],
  'home.brake': [
    L('Feet down. Hold the brakes and keep her straight. We still need the hangar.', 4.4),
  ],

  'end.bucket': [
    P('So that was the job?', 2.2),
    L('That was the interview.', 2.6),
  ],
  'end.bite': [
    L('Worth it.', 2.4),
  ],
  'end.envelope': [
    P('This is my cut?', 2.0),
    L('You’re still a prospect.', 2.6),
  ],
};

/** Lou's one-liners, fired by state rather than by script. */
export const BARKS = {
  stall: [
    'Nose down! The sky is not holding meetings today!',
    'Nose down. Down. The other down.',
    'You’re out of speed and ideas. Fix the speed one.',
  ],
  overspeed: [
    'Ease off. She starts shedding parts as a hint.',
    'That noise is the airframe filing a complaint.',
  ],
  terrain: [
    'Ground. Ground is a solid.',
    'Up. Now would be the time.',
  ],
  gearHard: [
    'Feel that? That was the landing gear’s entire remaining career.',
    'That noise came out of the maintenance budget.',
    'If the wheels are still round, buy them dinner.',
  ],
  banked: [
    'Level it. My coffee has opinions.',
    'That’s a lot of angle for a man with my stomach.',
  ],
  smooth: [
    'That’s better. Keep doing whatever that was.',
    'Good. Boring. Boring is the whole job.',
    'There. Small inputs. The plane likes that.',
  ],
  rough: [
    'Easy on the yoke. You are flying an aeroplane, not shaking a vending machine.',
    'Stop stirring the sky. Small inputs.',
    'Your hands have opinions. I need them to have fewer.',
  ],
  holy: [
    'Holee leee.',
    'If you meant to do that, never do it again.',
    'My stomach just filed a transfer request.',
  ],
  offCourseLeft: [
    'Marker is left. Turn left and bring the diamond back into the glass.',
    'You are right of course. Ease left; the compass is asking politely.',
    'The arrow wants left. It is better at directions than either of us.',
  ],
  offCourseRight: [
    'Marker is right. Turn right and put the diamond back in the middle.',
    'You are left of course. Ease right; the compass is asking politely.',
    'The arrow wants right. It is better at directions than either of us.',
  ],
  taxiLost: [
    'Yellow line to the double bars. That is hold short for runway eighteen.',
    'The runway is east of the apron. Follow the yellow stripe; we painted it for this exact moment.',
  ],
  cargoShift: [
    'Something moved back there. That is never good news.',
    'The jerky changed seats. Fly like it has another vote.',
    'Cargo is walking around back there. Smooth it out.',
  ],
  patrolClose: [
    'Lower. Trees are free cover and nobody bills you for them.',
    'Keep the ridge between us and the badge.',
    'Cloud or canyon. Either one has fewer forms.',
  ],
  cruise: [
    'Hold this line. The aeroplane finally believes you.',
    'That is good flying. Do not celebrate where the plane can hear you.',
    'Needles steady, cargo quiet. This is the part nobody puts in the movie.',
    'Keep the diamond centered and let the engines earn their fuel.',
    'Small corrections. We are smuggling beef, not wrestling weather.',
    'Look outside once in a while. The mountains are doing most of the navigating.',
  ],
  finalLine: [
    'Runway is under the lights. Bring the nose back to center.',
    'You are drifting off the pavement. Correct gently.',
    'Centerline first. Pride later.',
  ],
  finalFast: [
    'Too fast for this runway. Power back and let the nose rise.',
    'Slow it down. Asphalt is cheaper than forest, but there is less of it.',
    'We need wheels on pavement, not a low pass for the county.',
  ],
  finalHigh: [
    'You are high. Power back and follow the light ladder down.',
    'The runway is below us, which is useful only if we descend.',
    'Ease the nose down. We are out of sky before we are out of runway.',
  ],
  finalFlare: [
    'Eyes at the far end. Hold it off.',
    'Easy now. Let the runway come to you.',
    'Small pull. Keep it straight. Let her settle.',
  ],
};

/**
 * The recording cue for one line.
 *
 * Every line gets its own cue rather than sharing a pool with the rest of its
 * beat, because a pooled cue plays a random member and the subtitle on screen
 * is a specific one — mismatched words are worse than silence. Barks are picked
 * randomly at the *text* level, so they are per-line too.
 *
 * The engine's `say()` matches `vo.<cue>.<take>`, so a cue never ends in the
 * take number: `beefrun.sasole.greeting-1` is read from
 * `assets/sfx/vo.beefrun.sasole.greeting-1.1.mp3`, and an alternate take is `.2`.
 */
export const cueOf = (beatId, index, who) =>
  `beefrun.${String(who || 'sasole').toLowerCase()}.${beatId}-${index + 1}`;

export const barkCueOf = (pool, index) => `beefrun.sasole.bark-${pool}-${index + 1}`;

/** Every cue the mission can ask for, with the words that go in it. */
export function allCues() {
  const out = [];
  for (const [id, beat] of Object.entries(BEATS)) {
    beat.forEach((line, i) => out.push({ cue: cueOf(id, i, line.who), who: line.who, text: line.text, beat: id }));
  }
  for (const [pool, lines] of Object.entries(BARKS)) {
    lines.forEach((text, i) => out.push({ cue: barkCueOf(pool, i), who: 'SASOLE', text, bark: pool }));
  }
  return out;
}

/** The mission's objective strings, in the order they appear. */
export const OBJECTIVES = {
  meetLou: 'Find Captain Sasole',
  preflight: 'Complete the preflight walkaround',
  meetStove: 'See what Old Stove wants',
  loadGuns: 'Load Old Stove’s three crates',
  unloadGuns: 'Get Old Stove’s crates out of the aeroplane',
  board: 'Get in the left seat',
  start: 'Start both engines',
  taxi: 'Follow the yellow line to hold short, runway 18',
  runup: 'Hold short and run the engines up',
  lineup: 'Taxi onto runway 18 and line up southbound',
  takeoff: 'Take off — rotate at 60 knots',
  south: 'Follow Lou’s landmarks south',
  approach: 'Find El Hueso and land uphill',
  meetCecilio: 'Meet Don Cecilio',
  load: 'Load three crates and balance the aeroplane',
  strap: 'Strap the crates and latch the cargo door',
  depart: 'Take off downhill, toward the cliff',
  evade: 'Get home without being located',
  engine: 'Nurse the left engine',
  home: 'Land at Whispering Pines',
  taxiHome: 'Taxi to the hangar',
};
