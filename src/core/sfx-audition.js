/**
 * Data contract for the footstep and record-pool sections of the sound
 * audition page (`weapon-sound-audition.html` — the weapons kept the filename).
 *
 * Owner, 2026-08-31: *"pull up that HTML file with all the different sound
 * effects so we can choose which one we want. I know we generated multiple
 * copies for, like, the gun sound effects and the the feet sound effects.
 * Make sure they're listed out as far as the walking sound effects for the
 * footsteps as what scene it's in and what the material is supposed to be."*
 *
 * So every footstep recording on disk is here, grouped by the MATERIAL it
 * represents, and every candidate names the scenes that actually play it —
 * traced through the three real mechanisms rather than guessed:
 *
 *   - the shared surface path (`core/audio.js` FOOTSTEP_VARIANTS + the
 *     `footstep.<surface>` fallback, fed by each scene's `world.floorZones`),
 *   - the combat cadence (`core/combat/audio.js` stepCue),
 *   - the two self-contained families (the Jerky Motel's a/b pairs in
 *     `motel/audio.js`, the Squatchfather's leather-sole Foley).
 *
 * Favorites recorded on the page are review data, not production routing —
 * exactly the weapons-section contract. Nothing here changes what a scene
 * plays until a choice is deliberately promoted.
 */

export const FOOTSTEP_AUDITION_STORAGE_KEY = 'squatchsmash.footstep-audition.v1';
export const SONG_PICK_STORAGE_KEY = 'squatchsmash.cabin-song-picks.v1';
export const MUSIC_MANIFEST_URL = './assets/music/manifest.json';

/** A believable walking clip: eight strides at a relaxed indoor pace. */
export const FOOTSTEP_WALK_STEPS = 8;
export const FOOTSTEP_WALK_INTERVAL_S = 0.46;

export function footstepWalkOffsets(
  count = FOOTSTEP_WALK_STEPS,
  interval = FOOTSTEP_WALK_INTERVAL_S,
) {
  const steps = Math.max(1, Math.trunc(count));
  const gap = Math.max(0.1, Number(interval) || FOOTSTEP_WALK_INTERVAL_S);
  return Object.freeze(Array.from({ length: steps }, (_, i) => i * gap));
}

const step = (id, name, files, where, description, extra = {}) => Object.freeze({
  id,
  name,
  files: Object.freeze(files.map((file) => `./assets/sfx/${file}`)),
  filenames: Object.freeze([...files]),
  where: Object.freeze([...where]),
  description,
  ...extra,
});

/**
 * `shelf: true` marks a recording no walking surface reaches today. It is
 * still auditionable — picking one is how it gets promoted into a scene.
 */
export const FOOTSTEP_AUDITION_GROUPS = Object.freeze([
  Object.freeze({
    id: 'wood',
    name: 'Floorboards',
    note: 'The shared path alternates the a/b pair and never repeats a board twice.',
    candidates: Object.freeze([
      step('wood-pair', 'Board pair (tight + hollow)',
        ['footstep.wood.a.mp3', 'footstep.wood.b.mp3'],
        ['Starter apartment — every board', 'Cabin — main room, porch, footbridge, shed',
          'Luxury apartment — main floor, loft, stairs', 'Silver Room — stage deck, manager’s office',
          'Mansion tour + siege — the whole house', 'No Wake — dock and boat',
          'Beef Run / Enola — everywhere off the apron', 'Silver Case — the flat', 'Initiation — porch and cabin room'],
        'The workhorse: two boards traded off so a walk never drums.'),
      step('wood-single', 'Single board (one-shots)',
        ['footstep.wood.mp3'],
        ['Squatchfather — under the leather sole', 'No Wake — the step below decks', 'Initiation — a man behind him shifts'],
        'The lone take the one-shot moments lean on.'),
      step('wood-leather', 'Leather sole on board',
        ['footstep.leather.wood.mp3'],
        ['Squatchfather — the dining room (layered over the board)'],
        'A dress shoe, because that scene is a dinner.'),
    ]),
  }),
  Object.freeze({
    id: 'tile',
    name: 'Tile & marble',
    note: 'Combat NPCs on marble and stone resolve here too.',
    candidates: Object.freeze([
      step('tile-shared', 'Hard tile',
        ['footstep.tile.mp3'],
        ['Starter apartment — kitchen + bathroom', 'Cabin — bathroom', 'Luxury apartment — kitchen stone + bathroom',
          'Silver Room — kitchen, walk-in, dish pit, lobby, corridors, restrooms', 'Silver Case — hallway',
          'Beef Run / Enola — the aprons and El Hueso runway', 'Cartel Palace — the main house',
          'Mansion siege — ground-floor marble (enemy steps)', 'Bada Bing — the whole club today (zone-order bug, being fixed)'],
        'One recording carrying every hard interior in the game.'),
      step('tile-leather', 'Leather sole on tile',
        ['footstep.leather.tile.mp3'],
        ['Squatchfather — the bathroom (layered over the tile)'],
        'Same dinner, harder floor.'),
      step('tile-motel', 'Motel bathroom pair',
        ['motel.footstep.tile.a.mp3', 'motel.footstep.tile.b.mp3'],
        ['Jerky Motel — the bathroom'],
        'The motel cut its own set; this is its tile.'),
    ]),
  }),
  Object.freeze({
    id: 'carpet',
    name: 'Carpet & rug',
    candidates: Object.freeze([
      step('rug', 'Rug (thick)',
        ['footstep.rug.mp3'],
        ['Starter apartment — the living-room rug', 'Luxury apartment — the lounge rug',
          'Cartel Palace — the far room', 'Combat NPCs on any carpet'],
        'Soft pile; the shared path’s only soft interior.'),
      step('carpet', 'Carpet (thin commercial)',
        ['footstep.carpet.mp3'],
        ['Silver Room — dining room + the south staff corridor'],
        'Tighter than the rug; a restaurant floor.'),
      step('carpet-motel', 'Motel room pair',
        ['motel.footstep.carpet.a.mp3', 'motel.footstep.carpet.b.mp3'],
        ['Jerky Motel — Rooms 11 and 12'],
        'The anonymous night, on its own carpet.'),
    ]),
  }),
  Object.freeze({
    id: 'concrete',
    name: 'Concrete & street',
    candidates: Object.freeze([
      step('concrete', 'Concrete',
        ['footstep.concrete.mp3'],
        ['Cabin — the firepit apron', 'Silver Room — street, alley, cellar, backstage',
          'Cartel Palace — courtyard and every guard', 'Mansion siege — basement (enemy steps)'],
        'Bare slab, indoors and out.'),
      step('concrete-motel', 'Motel walkway pair',
        ['motel.footstep.concrete.a.mp3', 'motel.footstep.concrete.b.mp3'],
        ['Jerky Motel — the walkways (its default ground)'],
        'The motel’s own slab.'),
      step('asphalt-motel', 'Motel parking-lot pair',
        ['motel.footstep.asphalt.a.mp3', 'motel.footstep.asphalt.b.mp3'],
        ['Jerky Motel — the parking lot'],
        'Looser than the walkway; grit under it.'),
      step('asphalt', 'Asphalt',
        ['footstep.asphalt.mp3'],
        ['Authored for THE TAKE’s street — the heist never wired footsteps, so nothing plays it yet'],
        'On the shelf until the bank job walks.', { shelf: true }),
      step('street-wet', 'Wet street (leather sole)',
        ['footstep.street.wet.mp3'],
        ['Special Meeting — the entire scene', 'Squatchfather — outside the restaurant'],
        'Rain on pavement and a dress shoe in it.'),
    ]),
  }),
  Object.freeze({
    id: 'outdoors',
    name: 'Outdoors',
    note: 'The forest floor is a rotation — dirt, leaf crunch, a pitched-up twig crack, grass — '
      + 'not one file. Golf bunkers ask for sand and NO sand recording exists: '
      + 'every bunker step today is a synth tick.',
    candidates: Object.freeze([
      step('gravel', 'Gravel',
        ['footstep.gravel.mp3'],
        ['Cabin — the car pad', 'Initiation — the clearing', 'Silver Pines — the cart path', 'Mansion siege — the driveway'],
        'Loose stone, crunch forward.'),
      step('dirt', 'Packed dirt',
        ['footstep.dirt.mp3'],
        ['Cabin — trail loop + overlook trail', 'Graveyard — the grave path', 'Initiation — track and trail', 'Forest rotation — one leg'],
        'The trail sound.'),
      step('grass', 'Grass',
        ['footstep.grass.mp3'],
        ['Graveyard — the whole yard', 'Silver Pines — tee through green', 'Mansion siege — the lawn', 'Forest rotation — one leg'],
        'Soft ground, no grit.'),
      step('leaves', 'Leaf litter',
        ['footstep.leaves.mp3'],
        ['Cabin — the woodland floor', 'Initiation — the woodland', 'Forest rotation — two legs (crunch + fast twig crack)'],
        'Dry litter; the twig-crack leg plays this pitched up.'),
      step('puddle', 'Standing water',
        ['footstep.puddle.mp3'],
        ['Cabin — the creek corridor', 'Silver Pines — the water hazard'],
        'A boot finding water.'),
      step('forest-single', 'Forest (single file)',
        ['footstep.forest.mp3'],
        ['Nothing — the forest rotation above replaced it'],
        'On the shelf; the rotation reads better than one loop.', { shelf: true }),
      step('snow', 'Snow',
        ['footstep.snow.mp3'],
        ['Nothing — no winter ground exists yet'],
        'On the shelf for a winter that has not shipped.', { shelf: true }),
    ]),
  }),
  Object.freeze({
    id: 'motel-only',
    name: 'Motel stairs & pool',
    note: 'Two surfaces only the Jerky Motel owns.',
    candidates: Object.freeze([
      step('stairs-motel', 'Steel stairs pair',
        ['motel.footstep.stairs.a.mp3', 'motel.footstep.stairs.b.mp3'],
        ['Jerky Motel — the stairs and the balcony walkway'],
        'Anything above ground level rings like this.'),
      step('pool-motel', 'Empty pool pair',
        ['motel.footstep.pool.a.mp3', 'motel.footstep.pool.b.mp3'],
        ['Jerky Motel — down in the drained pool'],
        'The basin has its own slap.'),
    ]),
  }),
  Object.freeze({
    id: 'shelf-special',
    name: 'On the shelf',
    note: 'Recorded, reachable by no walking surface today.',
    candidates: Object.freeze([
      step('metal', 'Metal grate',
        ['footstep.metal.mp3'],
        ['Today only the AK’s magazine hitting the floor uses it — no surface walks it'],
        'Waiting on a catwalk.', { shelf: true }),
      step('lino', 'Linoleum',
        ['footstep.lino.mp3'],
        ['Nothing — the Silver Room kitchen went with tile'],
        'A softer kitchen that never got built.', { shelf: true }),
    ]),
  }),
]);

export function footstepAuditionFavorite(raw, groupId) {
  const choice = raw && typeof raw === 'object' ? raw[groupId] : null;
  const group = FOOTSTEP_AUDITION_GROUPS.find((entry) => entry.id === groupId);
  return group?.candidates.some((candidate) => candidate.id === choice) ? choice : null;
}

/**
 * Normalize the music manifest for the record-pool section, mirroring
 * `Radio.playlist` exactly: a record airs at a venue when it is not a scripted
 * cue and either carries no venue or names this one. The cabin is the venue
 * the owner asked about — *"I'd also like to select the radio songs that are
 * gonna be on during the scene because you're hearing them from the cabin."*
 */
export function songAuditionRows(manifest, { venue = 'countryside_cabin' } = {}) {
  const tracks = Array.isArray(manifest?.tracks) ? manifest.tracks : [];
  return tracks.map((track) => {
    const cue = track.cue === true;
    const airsHere = !cue && (!track.venue || track.venue === venue);
    return Object.freeze({
      file: track.file,
      url: `./assets/music/${track.file}`,
      title: track.title ?? track.file,
      artist: track.artist ?? '',
      cue,
      venue: track.venue ?? null,
      airsHere,
      scopeLabel: cue
        ? 'scripted cue — never station programming'
        : track.venue
          ? (track.venue === venue ? `scoped to ${track.venue} — airs here` : `scoped to ${track.venue} only`)
          : 'in the 97.8 record pool — airs here today',
    });
  });
}

export function songPicks(raw, rows) {
  if (!raw || typeof raw !== 'object') return [];
  const known = new Set(rows.map((row) => row.file));
  return Object.keys(raw).filter((file) => raw[file] === true && known.has(file));
}
