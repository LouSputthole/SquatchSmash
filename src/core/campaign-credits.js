/**
 * THE CRAWL.
 *
 * Two jokes, one list.
 *
 * The first is that Big Uncle Lou Sputthole did everything. Two hundred and
 * forty separate credits, opening with the ones a producer would actually
 * claim and ending somewhere he should not be allowed near, and every one of
 * them his. It reads straight for about thirty seconds and then stops reading
 * straight, which is the whole gag: nobody watching a credit roll is reading
 * it, and this one punishes the person who does.
 *
 * The second is that everybody else gets exactly one credit, as themselves,
 * because they are not actors.
 *
 * The roll is data, not markup, so `tests/campaign-credits.test.mjs` can hold
 * the count, the uniqueness and the ordering without a browser, and so the
 * owner can add to it without touching a view.
 */

import { CHARACTER_REGISTRY } from './characters.js';

/**
 * The two hundred and forty.
 *
 * Ordered so a reader watching it go past sees a real film crew slowly stop
 * being one. Keep new entries in the block they belong to; the escalation is
 * the joke and shuffling it flattens the joke.
 */
export const LOU_CREDITS = Object.freeze([
  /* --- The ones he would actually put on a poster --- */
  'Directed by', 'Produced by', 'Written by', 'Executive Producer',
  'Co-Executive Producer', 'Associate Producer', 'Line Producer',
  'Producer (Uncredited)', 'Story by',
  'Screenplay by', 'Based on an Idea by', 'Created by',
  'Presented by', 'A Film by',

  /* --- Direction --- */
  'First Assistant Director', 'Second Assistant Director',
  'Second Second Assistant Director', 
  'Second Unit Director', 
  'Dialogue Director',
  'Casting Director', 'Extras Casting',
  'Script Supervisor', 'Continuity', 'Continuity (Bandanas)',
  'Continuity (Mud)',

  /* --- Camera --- */
  'Director of Photography', 'Camera Operator', 'A Camera Operator',
  'B Camera Operator', 'Steadicam Operator',
  'First Assistant Camera', 'Focus Puller',
  'Clapper Loader', 
  'Drone Operator', 'Crane Operator', 'Underwater Camera',
  'Aerial Photography', 'Still Photographer', 
  'Camera Car Driver', 'Lens Cleaner',

  /* --- Lighting and grip --- */
  'Gaffer', 'Best Boy Electric', 'Best Boy Grip', 'Key Grip', 'Dolly Grip',
  'Grip', 
  'Practical Lamps',
  'Headlight Alignment', 'Burn Barrel Technician', 'Fire Marshal',
  'Fire Marshal (Second Unit)', 'Candle Wrangler', 'Stove Supervisor',

  /* --- Art department --- */
  'Production Designer', 'Art Director', 
  'Set Decorator', 'Set Dresser',
  'Property Master', 'Assistant Property Master',
  'Armourer', 'Weapons Handler', 
  'Sign Painter', 'Scenic Artist', 'Construction Coordinator', 'Carpenter',
  'Painter', 'Greensman',

  /* --- Costume --- */
  'Costume Designer', 'Costume Supervisor',
  'Wardrobe Master', 'Wardrobe Assistant',
  'Tailor', 'Seamstress', 'Shoe Wrangler', 'Tracksuit Consultant',
  'Vest Fitter', 'Bandana Tying',

  /* --- Hair, makeup and fur --- */
  'Makeup Department Head', 
  'Hair Department Head', 
  'Prosthetics Designer', 'Special Effects Makeup',
  'Blood Continuity', 'Fur Supervisor', 'Fur Grooming', 'Fur Continuity',
  'Beard Wrangler',

  /* --- Sound --- */
  'Sound Designer', 'Supervising Sound Editor', 'Production Sound Mixer',
  'Re-Recording Mixer', 'Boom Operator', 'Second Boom Operator',
  'Dialogue Editor', 'ADR Supervisor', 
  'Foley Artist', 'Foley Walker', 
  'Sound Effects Editor', 'Ambience Recordist',
  'Room Tone', 'Additional Room Tone', 'Loop Group',

  /* --- Music --- */
  'Music by', 'Original Score', 'Additional Music', 'Music Supervisor',
  'Music Editor', 'Orchestrator', 'Conductor', 
  'Score Mixer', 'Soloist', 'Choir',
  'Accordion',

  /* --- Editing and post --- */
  'Edited by', 'Additional Editing', 'First Assistant Editor',
  'Colourist',
  'Digital Intermediate', 'Conform', 'Titles Designer',
  'End Crawl', 'Deliverables', 'Quality Control', 'Archivist',
  'Negative Cutter', 'Projectionist',

  /* --- Visual effects --- */
  'Visual Effects Supervisor', 'Visual Effects Producer', 'CG Supervisor',
  'Compositing Supervisor', 'Compositor', 'Matte Painter', 'Rotoscope',
  'Tracking', 'Layout', 'Modelling', 'Texturing', 'Rigging', 'Animation',
  'Lighting TD', 'Effects TD', 'Render Wrangler',

  /* --- Stunts and action --- */
  'Stunt Coordinator', 'Assistant Stunt Coordinator', 'Fight Choreographer',
  'Stunt Double', 'Stunt Double (Second Unit)', 'Stunt Driver',
  'Precision Driver', 'Utility Stunts', 'Safety Officer',
  'Wire Work', 'Squib Technician', 'Falls', 'Fire Burn',
  'Additional Falling Over',

  /* --- Production office --- */
  'Unit Production Manager', 'Production Supervisor',
  'Production Coordinator', 'Assistant Production Coordinator',
  'Production Secretary', 'Production Accountant',
  'First Assistant Accountant', 'Payroll Accountant', 'Auditor',
  'Legal Counsel', 'Clearances', 'Insurance', 'Publicist',
  'Unit Publicist', 'Office Runner', 'Office Runner (Second Unit)',

  /* --- Locations and transport --- */
  'Location Manager', 'Assistant Location Manager', 'Location Scout',
  'Location Assistant', 'Permits', 'Transportation Captain',
  'Transportation Co-Captain', 'Picture Car Coordinator', 'Picture Car Wrangler',
  'Driver', 'Second Driver', 'Van Driver', 'Boat Handler', 'Aircraft Handler',

  /* --- Catering --- */
  'Craft Services', 'Catering', 'Head Chef', 'Second Chef', 'Pastry',
  'Barista', 'Coffee', 'Second Coffee', 'Sandwiches', 'Ice',

  /* --- The parts of this particular business --- */
  'Jerky Consultant', 'Jerky Continuity', 'Beef Run Logistics',
  'Airstrip Liaison', 'Cargo Manifest', 'Trunk Liner', 'Boot Latch',
  'Saint Card Printing', 'Saint Card Wrangler', 'Candle Lighting',
  'Golf Cart Wrangler', 'Golf Ball Retrieval', 'Pool Skimming',
  'Projector Bulb', 'Theatre Seat Reclining', 'Pinball Maintenance',
  'Arcade Cabinet Repair', 'Cigar Cutting', 'Whiskey Pouring',
  'Ice Bucket', 'Napkins', 'Table Wiping', 'Bin Emptying',
  'Snow Shovelling', 'Mud',

  /* --- And by the end he is just claiming things --- */
  'Weather', 'Trees', 'The Lake', 'The Moon', 'Night', 'Fog', 'Silence',
  'Suspense', 'Tension', 'Pathos', 'The Third Act', 'Emotional Support',
  'Additional Yelling', 'The Voice In Your Head', 'Loyalty',
  'The Family', 'The Whole Thing', 'Everything Else',
  'Special Thanks to Lou Sputthole', 'And Introducing Lou Sputthole',
]);

/**
 * Everybody else, once each, as themselves.
 *
 * Built from `CHARACTER_REGISTRY` rather than typed out, so a character added
 * to the campaign is in the crawl without anybody remembering to put them
 * there -- the failure mode this project keeps paying for is a second list
 * that drifts from the first.
 *
 * "as Themselves" for the whole cast, deliberately and uniformly. It is what
 * the owner asked for in those words, it is the phrasing that needs no
 * assumption about anybody, and a crawl where the wording is identical for
 * every name reads as a house style rather than as a series of decisions.
 */
export const CAST_CREDIT_ROLE = 'as Themselves';

/** Every important character is credited, including the Prospect as himself. */
export const CREDIT_EXCLUDED_CHARACTERS = Object.freeze([]);

export function castCredits(registry = CHARACTER_REGISTRY) {
  return Object.values(registry)
    .filter((character) => !CREDIT_EXCLUDED_CHARACTERS.includes(character.id))
    .map((character) => Object.freeze({
      role: CAST_CREDIT_ROLE,
      /* Tony's credit is the player's role, exactly as the owner listed it;
       * everybody else gets the canonical name they use across the campaign. */
      name: character.id === 'prospect'
        ? (character.subtitleName ?? 'Prospect')
        : (character.canonicalName ?? character.subtitleName ?? character.id),
    }));
}

/** Section headings, so the crawl has shape rather than being one column. */
export const CREDIT_SECTIONS = Object.freeze({
  CAST: 'THE FAMILY',
  LOU: 'BIG UNCLE LOU SPUTTHOLE',
  END: '',
});

/**
 * The whole crawl, in order: the cast first, then Lou, at length.
 *
 * The cast goes first on purpose. Putting Lou's two hundred and forty at the
 * top means nobody ever reaches the family; putting them second means the
 * reader has already settled into the rhythm of one-credit-per-person when it
 * stops stopping.
 */
export function campaignCreditRoll({ registry = CHARACTER_REGISTRY } = {}) {
  return Object.freeze([
    Object.freeze({ kind: 'section', text: CREDIT_SECTIONS.CAST }),
    ...castCredits(registry).map((credit) => Object.freeze({ kind: 'credit', ...credit })),
    Object.freeze({ kind: 'section', text: CREDIT_SECTIONS.LOU }),
    ...LOU_CREDITS.map((role) => Object.freeze({
      kind: 'credit', role, name: 'Lou Sputthole',
    })),
  ]);
}
