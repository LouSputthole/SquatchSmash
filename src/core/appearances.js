/**
 * WHO IS IN WHAT, AND WHAT THEY HAVE ON WHEN THEY ARE IN IT.
 *
 * `src/core/wardrobe.js` answers "what does Big Uncle Lou wear". It cannot
 * answer "what is Big Uncle Lou wearing at the Bing", because that is not its
 * decision: the club spreads `BIG_UNCLE_LOU_BING`, the mansion spreads
 * `BIG_UNCLE_LOU_MANSION`, the boat spreads plain `BIG_UNCLE_LOU`, and the golf
 * course composes his canonical body under its exported argyle outfit. One
 * man, four outfits, four files, and until this ledger existed there was
 * nowhere to see the four of them next to each other.
 *
 * So this is the second half of the wardrobe: a row per person per scene,
 * naming where in the scene they are and which model that scene actually
 * dresses them in. `src/wardrobe/preview.js` reads it and shows it —
 * everybody in a scene, or one person across every scene they are in.
 *
 * ## The four rules this file lives by
 *
 * **1. It is a ledger, not a second wardrobe.** Wherever a scene dresses
 * somebody out of `src/core/wardrobe.js`, the `model` below IS that frozen
 * export — the same object, not a copy of it. Change a garment there and this
 * file, the fitting room and the game all move together, because there is only
 * one of it.
 *
 * **2. Where a scene types clothes out inline, the copy here is QUARANTINED
 * AND WIRED TO AN ALARM.** Private fixed models and exported scene variants
 * are checked field by field against the real scene by
 * `tests/appearances.test.mjs`. A hand-written copy with no test on it is a
 * document; with a test on it, it is a mirror that shouts. **Never edit a
 * `from.source` model here to "fix" a scene — the alarm is telling you the
 * scene changed, and the scene is right.**
 *
 * **3. Every row carries `evidence`: a literal substring of the scene's own
 * source.** That is the tripwire in the other direction. A row here claiming
 * somebody is in a scene has to point at the line that puts him there, and the
 * test reads the file and looks for it. Delete a man from a scene and this
 * ledger fails rather than quietly going on describing him.
 *
 * **4. It imports NOTHING that imports three.** `./campaign.js`,
 * `./wardrobe.js`, `./hotdog-model.js` and `../bing/family-ape.js` are all
 * plain data with no renderer behind them, and that is the whole import list on
 * purpose. `src/core/wardrobe.js` has no imports at all and is the better for
 * it; a ledger of who wears what should be readable by a check, a tool or a
 * headless test without dragging a WebGL context in behind it. It is the same
 * argument `src/mansion/cast.js` makes about `MansionGrounds.js` at the top of
 * itself, and the same one that cost `npm test` 215 tests the day somebody
 * ignored it.
 *
 * ## What is IN this ledger and what is deliberately not
 *
 * IN: everybody with a campaign identity (`CHARACTER_IDS`), plus authored
 * fixed-identity extras reused by a scene — Lou's door man, his six guards,
 * the Bada Bing's bartender and the five exact Mansion performer variants.
 *
 * OUT of the named rows: anonymous room fill. Its finite authored clothing,
 * body and job vocabulary is instead enumerated by
 * `PROCEDURAL_APPEARANCE_TEMPLATES`, with deterministic min/max fixtures, so a
 * random roll cannot hide a broken combination. Also out:
 * the two dressed bodies in the siege's aftermath (`src/mansion/siege/
 * dressing.js`) — the dead performer has no name yet on purpose, and that
 * decision is `docs/OPEN-DECISIONS.md` §4's, not this file's.
 *
 * ## What this ledger says that nothing else in the repo says
 *
 * Read `divergenceStatus` beside every non-null `divergence`. The audit now
 * hard-fails on `unresolved`; the only remaining differences are two explicit
 * `intentional` Enola aircrew work outfits.
 */

import { CHARACTER_IDS, SCENE_IDS } from './campaign.js';
import { BILLY_HOTDOG_MODEL } from './hotdog-model.js';
import { APE_FAMILY_MEMBER } from '../bing/family-ape.js';
import {
  AUBBIE, BADA_BING_BARTENDER, BIG_UNCLE_LOU, BIG_UNCLE_LOU_BING,
  BIG_UNCLE_LOU_MANSION, BOOSKI, CAPTAIN_LOU_SASOLE, DEATHMEGATRON, ERIC,
  GRATIN, HOG_MAMA, IRISH, MANSION_BOOTH_MAN, MANSION_DOOR_MAN, MANSION_GUARDS, NUMBSKULL,
  JAMES_BLOND, RIPPINFLOW, SAUCE, SHUBENATOR, SNOW, WILLY,
} from './wardrobe.js';

/* ====================================================================== *
 * THE SCENES
 *
 * `short` is a column heading, and it exists because seven "Lou's mansion —
 * the house" headings in a 300-pixel panel are seven columns one character
 * wide. It is a label and nothing keys off it.
 *
 * `rig` is the fitting room's lighting rig this scene is judged under, and
 * it is not decoration: a gold rope that reads under a studio key is a smear
 * under the Bing's one warm bulb, so a scene's people should default to the
 * light that scene is actually played in. Three rigs exist
 * (`src/wardrobe/preview.js`'s `RIGS`) and some scenes are none of them —
 * the graveyard is moonlight and the Silver Room is candles. Those take the
 * nearest and say so, rather than growing a fourth rig this pass has not
 * looked at anybody under.
 * ====================================================================== */

export const SCENES = Object.freeze({
  apartment: Object.freeze({
    id: 'apartment',
    label: "Tony's apartment — the morning after",
    short: 'Apartment',
    rig: 'studio',
    modules: Object.freeze(['src/world/dressing.js']),
    note: 'Tony is first-person. Margo is a fixed authored private rig with a blouse, jeans, shoes and her shared head restyle; it is catalogued source-only rather than reconstructed.',
  }),
  bada_bing: Object.freeze({
    id: 'bada_bing',
    label: 'The Bada Bing — an ordinary night',
    short: 'Bing',
    rig: 'bing',
    modules: Object.freeze([
      'src/bing/family.js', 'src/bing/cast.js', 'src/bing/license-to-grill-runtime.js',
    ]),
    note: 'The Family hang out here whenever the player is not on a mission. '
      + 'Two modules dress it: the roster on the floor (family.js) and the '
      + 'people who work in the building (cast.js), including Lou upstairs.',
  }),
  bing_party: Object.freeze({
    id: 'bing_party',
    label: 'The Bada Bing — the closed party (HOT DOG)',
    short: 'Party',
    rig: 'bing',
    modules: Object.freeze(['src/bing/hotdog-party.js']),
    note: 'The same Family, the same building, the same clothes — the party '
      + 'moves people around the room and adds Lou, Billy HotDog, Aubbie and '
      + 'Sauce as figures with their own business. Nobody is redressed.',
  }),
  squatchfather: Object.freeze({
    id: 'squatchfather', label: 'THE SQUATCHFATHER — Sorrento\'s', short: 'Squatchfather', rig: 'bing',
    modules: Object.freeze([
      'src/squatchfather/characters/ProspectController.js',
      'src/squatchfather/characters/SalController.js',
      'src/squatchfather/characters/McClawskyController.js',
      'src/squatchfather/scenes/SquatchfatherScene.js',
    ]),
    note: 'A fixed scene-local Figure rig. Every authored principal and bystander is catalogued source-only rather than translated onto makePerson.',
  }),
  no_wake: Object.freeze({
    id: 'no_wake',
    label: 'NO WAKE — the boat',
    short: 'NO WAKE',
    rig: 'day',
    modules: Object.freeze(['src/nowake/world.js']),
    note: 'Four men on a deck in daylight. Willy is alive here and is alive '
      + 'nowhere after it.',
  }),
  graveyard: Object.freeze({
    id: 'graveyard',
    label: 'The Squatch graveyard — the burial',
    short: 'Graveyard',
    rig: 'bing',
    modules: Object.freeze(['src/graveyard/world.js']),
    note: 'Moonlight, which is not one of the three rigs. `bing` is the '
      + 'nearest — dark ground, one directional source — and it is warmer '
      + 'than the scene is. Judge colour under `studio` here, not under this.',
  }),
  jerky_motel: Object.freeze({
    id: 'jerky_motel', label: 'The Jerky Motel — room twelve', short: 'Motel', rig: 'day',
    modules: Object.freeze(['src/motel/actors.js']),
    note: 'Snow and six fixed motel characters use a private human rig; randomized thugs are templates rather than fixed identities.',
  }),
  golf: Object.freeze({
    id: 'golf',
    label: 'Golf — Thursday morning',
    short: 'Golf',
    rig: 'day',
    modules: Object.freeze(['src/golf/cast.js']),
    note: 'The exported GOLF_WARDROBE composes each named golfer\'s canonical '
      + 'body under a scene-owned argyle outfit.',
  }),
  silver_room: Object.freeze({
    id: 'silver_room',
    label: 'The Silver Room',
    short: 'Silver Room',
    rig: 'bing',
    modules: Object.freeze(['src/silver/cast.js', 'src/silver/date.js']),
    note: 'Candlelight over white linen, so `bing` again as the nearest warm '
      + 'rig. Ape and Margo are fixed named cast; everybody else is staff and diners.',
  }),
  bank_heist: Object.freeze({
    id: 'bank_heist',
    label: 'THE TAKE — the bank job',
    short: 'Heist',
    rig: 'day',
    modules: Object.freeze(['src/heist/cast.js']),
    note: 'Five of the roster on a job, in work clothes and plate carriers. '
      + 'The presentation table here is the crew\'s WORKING kit and is '
      + 'legitimately not their club clothes — but it also re-decides their '
      + 'heights and, for two of them, their bodies. See the divergences.',
  }),
  silver_case: Object.freeze({
    id: 'silver_case', label: 'THE SILVER CASE — the apartment', short: 'Silver Case', rig: 'studio',
    modules: Object.freeze([
      'src/silvercase/cast/ape.js', 'src/silvercase/cast/prospect.js', 'src/silvercase/cast/cast.js',
    ]),
    note: 'Ape and four locals use makePerson in exact scene outfits; Tony is first-person and renders only the authored arm.',
  }),
  mansion_house: Object.freeze({
    id: 'mansion_house',
    label: "Lou's mansion — the house",
    short: 'Mansion',
    rig: 'bing',
    modules: Object.freeze([
      'src/mansion/cast.js', 'src/mansion/scenes/MansionInterior.js',
    ]),
    note: 'The walking tour and PROJECT SILENT SQUATCH. Willy and Billy '
      + 'HotDog are dead before this arc and are correctly absent. The old '
      + 'duplicate seated Lou was removed; the house now has one Lou row.',
  }),
  mansion_siege: Object.freeze({
    id: 'mansion_siege',
    label: "Lou's mansion — the siege",
    short: 'Siege',
    rig: 'bing',
    modules: Object.freeze(['src/mansion/siege/ensemble.js']),
    note: 'The same house a few hours later with the lights shot out. Every '
      + 'body is the canonical model; nobody is redressed for the fight, '
      + 'which is deliberate — they were at a party when it started.',
  }),
  beef_run: Object.freeze({
    id: 'beef_run',
    label: 'BEEF RUN — Whispering Pines and El Hueso',
    short: 'Beef Run',
    rig: 'day',
    modules: Object.freeze(['src/beefrun/npc.js']),
    note: 'BUILT ON A DIFFERENT RIG. The airstrip uses `makeFigure` from '
      + 'src/beefrun/npc.js, not the club\'s `makePerson` — blockier, fewer '
      + 'garment options. Sasole is still dressed out of the canonical record '
      + 'through `fromWardrobe()`, so the colours and the garment are right; '
      + 'what the fitting room shows is that record on the club figure, which '
      + 'is the outfit but not the silhouette.',
  }),
  enola_squatch: Object.freeze({
    id: 'enola_squatch',
    label: 'ENOLA SQUATCH — the crew',
    short: 'Enola',
    rig: 'day',
    modules: Object.freeze(['src/enolasquatch/crew.js']),
    note: 'The same block rig as the Beef Run, and unlike the Beef Run it '
      + 'reads NOTHING from the wardrobe: all four men are typed out inline. '
      + 'Nothing here can be shown in the fitting room without inventing a '
      + 'translation of one rig\'s options into another\'s, so these rows are '
      + 'listed and not drawn. They are the ledger\'s loudest finding.',
  }),
  cartel_palace: Object.freeze({
    id: 'cartel_palace', label: 'The Cartel Palace — the final assault', short: 'Palace', rig: 'day',
    modules: Object.freeze(['src/cartel-palace/cast.js']),
    note: 'Four fixed guard looks repeat over eight posts, followed by Mark and Sauce on the shared HeistFigure person rig.',
  }),
});

/* Campaign route -> appearance-ledger coverage. */
const coverage = (id, status, appearanceScenes, modules, note, requiredAppearances = []) => Object.freeze({
  id, status,
  appearanceScenes: Object.freeze(appearanceScenes),
  modules: Object.freeze(modules),
  requiredAppearances: Object.freeze(requiredAppearances.map((selector) => Object.freeze(selector))),
  note,
});

export const CAMPAIGN_SCENE_COVERAGE = Object.freeze({
  [SCENE_IDS.APARTMENT]: coverage(SCENE_IDS.APARTMENT, 'appearance-ledger', ['apartment'],
    ['src/main.js', 'src/world/dressing.js'],
    'Tony is first-person; Margo is a fixed source-only private-rig appearance across the protected wardrobe/date boundary.',
    [{ scene: 'apartment', character: CHARACTER_IDS.MARGO }]),
  [SCENE_IDS.BADA_BING_ONE]: coverage(SCENE_IDS.BADA_BING_ONE, 'appearance-ledger', ['bada_bing'],
    ['src/bing/family.js', 'src/bing/cast.js', 'src/bing/license-to-grill-runtime.js'],
    'The ordinary-night roster, Margo, staff and fixed License to Grill captive are direct appearance-ledger rows.',
    [
      { scene: 'bada_bing', character: CHARACTER_IDS.MARGO },
      { scene: 'bada_bing', character: CHARACTER_IDS.JAMES_BLOND, variant: 'license_to_grill' },
    ]),
  [SCENE_IDS.SQUATCHFATHER]: coverage(SCENE_IDS.SQUATCHFATHER, 'appearance-ledger', ['squatchfather'],
    ['src/squatchfather/characters/Figure.js'], 'Every fixed local-Figure outfit is catalogued with an explicit private-rig boundary.'),
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: coverage(SCENE_IDS.AIRSTRIP_SMUGGLING, 'appearance-ledger', ['beef_run'],
    ['src/beefrun/npc.js'], 'The Beef Run block-rig cast is catalogued without translating its silhouettes.'),
  [SCENE_IDS.BADA_BING_TWO]: coverage(SCENE_IDS.BADA_BING_TWO, 'appearance-ledger', ['bing_party'],
    ['src/bing/hotdog-party.js'], 'The closed-party roster has its own appearance-ledger view.'),
  [SCENE_IDS.SQUATCH_GRAVEYARD]: coverage(SCENE_IDS.SQUATCH_GRAVEYARD, 'appearance-ledger', ['graveyard'],
    ['src/graveyard/world.js'], 'Snow and Billy HotDog are represented by the burial scene models.'),
  [SCENE_IDS.JERKY_MOTEL]: coverage(SCENE_IDS.JERKY_MOTEL, 'appearance-ledger', ['jerky_motel'],
    ['src/motel/actors.js'], 'Every fixed motel preset is a source-only local-rig row; random thug templates are non-identities.'),
  [SCENE_IDS.NO_WAKE]: coverage(SCENE_IDS.NO_WAKE, 'appearance-ledger', ['no_wake'],
    ['src/nowake/world.js'], 'The four men on the boat are direct appearance-ledger rows.'),
  [SCENE_IDS.SILVER_ROOM]: coverage(SCENE_IDS.SILVER_ROOM, 'appearance-ledger', ['silver_room'],
    ['src/silver/cast.js', 'src/silver/date.js'],
    'Ape and Margo are the fixed named cast members; the remaining diners and staff are ambient bodies.',
    [{ scene: 'silver_room', character: CHARACTER_IDS.MARGO }]),
  [SCENE_IDS.SILVER_PINES]: coverage(SCENE_IDS.SILVER_PINES, 'appearance-ledger', ['golf'],
    ['src/golf/cast.js'], 'All four exact Silver Pines argyle models are direct ledger rows.'),
  [SCENE_IDS.BANK_HEIST]: coverage(SCENE_IDS.BANK_HEIST, 'appearance-ledger', ['bank_heist'],
    ['src/heist/cast.js'], 'All five fixed heist crew presentations are direct ledger rows.'),
  [SCENE_IDS.SILVER_CASE]: coverage(SCENE_IDS.SILVER_CASE, 'appearance-ledger', ['silver_case'],
    ['src/silvercase/cast/ape.js', 'src/silvercase/cast/prospect.js', 'src/silvercase/cast/cast.js'],
    'Ape and four locals are exact makePerson rows; Tony is an explicit arm-only private-viewmodel source row.',
    [{ scene: 'silver_case', character: CHARACTER_IDS.PROSPECT }]),
  [SCENE_IDS.MANSION_SIEGE]: coverage(SCENE_IDS.MANSION_SIEGE, 'appearance-ledger', ['mansion_siege'],
    ['src/mansion/siege/ensemble.js'], 'The fixed defensive ensemble is a direct appearance-ledger scene.'),
  [SCENE_IDS.ENOLA_SQUATCH]: coverage(SCENE_IDS.ENOLA_SQUATCH, 'appearance-ledger', ['enola_squatch'],
    ['src/enolasquatch/crew.js'], 'Captain Sasole uses the canonical block-rig wardrobe adapter; the remaining private aircrew rigs are catalogued source-only.'),
  [SCENE_IDS.MANSION_RETURN]: coverage(SCENE_IDS.MANSION_RETURN, 'alias', ['mansion_house'],
    ['src/mansion/cast.js'], 'The return visit reuses the exact house cast and outfits; only poses and evening locations change.'),
  [SCENE_IDS.CARTEL_PALACE]: coverage(SCENE_IDS.CARTEL_PALACE, 'appearance-ledger', ['cartel_palace'],
    ['src/cartel-palace/cast.js'], 'Four guard variants, Mark and Sauce are catalogued from the final mission cast.'),
  [SCENE_IDS.INITIATION]: coverage(SCENE_IDS.INITIATION, 'frozen', [],
    ['src/initiation/main.js'], 'Initiation is classified but unavailable: its runtime is frozen pending owner playtest and is neither imported nor reconstructed.'),
  [SCENE_IDS.MANSION]: coverage(SCENE_IDS.MANSION, 'appearance-ledger', ['mansion_house'],
    ['src/mansion/cast.js'], 'The walking tour and Silent Squatch house cast share one direct ledger scene.'),
});

/* ====================================================================== *
 * FINITE PROCEDURAL CLOTHING / POSE TEMPLATES
 *
 * Named people belong in APPEARANCES. Anonymous populations still have a
 * finite authored vocabulary, though, and a random roll can expose a bad
 * combination no named static row ever uses (the Silver queue's curvy gown
 * on its one leaning index was the first proof). These rows keep that matrix
 * separate and give the verifier deterministic low/high fixtures for every
 * source-permitted dress/body/job combination.
 * ====================================================================== */

const proceduralFixture = (id, model) => Object.freeze({ id, model: Object.freeze(model) });
const proceduralTemplate = ({ evidence, fixtures, ...template }) => Object.freeze({
  ...template,
  evidence: Object.freeze(evidence),
  fixtures: Object.freeze(fixtures),
});

const silverFixturePair = ({ dress, gown = false, diner = false }) => {
  const height = gown ? [1.60, 1.78] : [diner ? 1.68 : 1.66, 1.90];
  const build = diner ? [0.92, 1.30] : [0.90, 1.25];
  const shirts = gown ? [0x5a1430, 0x3a1a3a] : [0x1b1b22, 0x1e2430];
  const hair = gown ? ['long', 'crop'] : ['short', 'receding'];
  const common = gown ? { gender: 'female', bodyShape: 'curvy' } : {};
  return [
    proceduralFixture('min', {
      height: height[0], build: build[0], dress, shirt: shirts[0], hair: hair[0], ...common,
    }),
    proceduralFixture('max', {
      height: height[1], build: build[1], dress, shirt: shirts[1], hair: hair[1], ...common,
    }),
  ];
};

const rangeFixturePair = ({ dress, height, build = [1, 1], min = {}, max = {} }) => [
  proceduralFixture('min', { height: height[0], build: build[0], dress, ...min }),
  proceduralFixture('max', { height: height[1], build: build[1], dress, ...max }),
];

/* These colours are not extra variants. They are the first and last values
 * from makePerson's authored default rolls, folded into the same low/high
 * geometry fixtures so the browser result is deterministic. */
const RANDOM_PERSON_MIN = Object.freeze({
  shirt: 0x2a2f3a, skin: 0xd9a97f, hairColour: 0x2a1c14,
});
const RANDOM_PERSON_MAX = Object.freeze({
  shirt: 0x6a5a3a, skin: 0x6f4529, hairColour: 0x4a2a18,
});

const SILVER_QUEUE_EVIDENCE = [
  "const dress = pick(['suit', 'gown', 'suit', 'shirt']);",
  "job: i === 5 ? 'lean' : 'stand',",
];
const SILVER_DINER_EVIDENCE = [
  'const inGown = Math.random() < 0.42;',
  "job: Math.random() < 0.4 ? 'drink' : 'sit',",
];
const SILVER_KITCHEN_EVIDENCE = [
  "name: 'a cook', tier: i ? 'background' : 'ambient', job: 'work',",
  "model: { height: rand(1.66, 1.84), dress: 'chef', hair: pick(['crop', 'tied', 'short']) },",
];
const SILVER_SERVER_EVIDENCE = [
  "name: 'a waiter', tier: 'background', job: 'patrol',",
  "model: { height: rand(1.68, 1.84), dress: 'waistcoat', shirt: 0xd8d4cc, hair: pick(['crop', 'short', 'tied']) },",
];
const SILVER_BAND_EVIDENCE = [
  "job: 'stand', look: i === 6,",
  'height: rand(1.68, 1.86),',
  'build: i === 6 ? 1.05 : rand(0.95, 1.2),',
  "dress: 'suit',",
];
const BING_PERFORMER_EVIDENCE = [
  "name: 'a dancer', tier: i === 3 ? 'ambient' : 'background', job: 'dance',",
  "height: rand(1.70, 1.76), build: rand(1.04, 1.12), dress: 'bikini',",
  "Object.freeze({ skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f }),",
];
const BING_PATRON_EVIDENCE = [
  "name: 'a regular', tier: i < 3 ? 'ambient' : 'background', job: i % 2 ? 'drink' : 'sit',",
  'height: rand(1.66, 1.9), build: rand(0.95, 1.3),',
  "dress: pick(['shirt', 'tracksuit', 'suit']),",
];
const BING_TABLER_EVIDENCE = [
  "name: 'a regular', tier: 'background', job: 'drink',",
  "model: { height: rand(1.66, 1.84), dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'tied']) },",
];
const BING_STANDER_EVIDENCE = [
  "name: 'a regular', tier: i === 0 ? 'ambient' : 'background', job: 'lean',",
  'height: rand(1.68, 1.88), build: rand(1, 1.3),',
  "dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'bald']),",
];

export const PROCEDURAL_APPEARANCE_TEMPLATES = Object.freeze([
  proceduralTemplate({
    id: 'bing.performer.bikini.dance',
    scene: 'bada_bing',
    module: 'src/bing/cast.js',
    sourceFamily: 'stage-performer',
    dress: 'bikini',
    gender: 'female',
    bodyShape: 'curvy',
    job: 'dance',
    evidence: BING_PERFORMER_EVIDENCE,
    /* One exact authored performer look is enough for the random body extrema.
     * The four distinct looks and all four routines have their own fixed rows
     * and pose shots, so colour is not multiplied here. */
    fixtures: rangeFixturePair({
      dress: 'bikini', height: [1.70, 1.76], build: [1.04, 1.12],
      min: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f,
      },
      max: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f,
      },
    }),
  }),
  ...['shirt', 'tracksuit', 'suit'].flatMap((dress) => ['sit', 'drink'].map((job) => (
    proceduralTemplate({
      id: `bing.patron.${dress}.${job}`,
      scene: 'bada_bing',
      module: 'src/bing/cast.js',
      sourceFamily: 'seated-patron',
      dress,
      gender: null,
      bodyShape: null,
      job,
      evidence: BING_PATRON_EVIDENCE,
      fixtures: rangeFixturePair({
        dress, height: [1.66, 1.90], build: [0.95, 1.30],
        min: { ...RANDOM_PERSON_MIN, hair: 'short', bandana: false },
        max: { ...RANDOM_PERSON_MAX, hair: 'tied', bandana: true },
      }),
    })
  ))),
  ...['shirt', 'tracksuit'].map((dress) => proceduralTemplate({
    id: `bing.tabler.${dress}.drink`,
    scene: 'bada_bing',
    module: 'src/bing/cast.js',
    sourceFamily: 'table-patron',
    dress,
    gender: null,
    bodyShape: null,
    job: 'drink',
    evidence: BING_TABLER_EVIDENCE,
    fixtures: rangeFixturePair({
      dress, height: [1.66, 1.84],
      min: { ...RANDOM_PERSON_MIN, hair: 'short' },
      max: { ...RANDOM_PERSON_MAX, hair: 'tied' },
    }),
  })),
  ...['shirt', 'tracksuit'].map((dress) => proceduralTemplate({
    id: `bing.stander.${dress}.lean`,
    scene: 'bada_bing',
    module: 'src/bing/cast.js',
    sourceFamily: 'standing-patron',
    dress,
    gender: null,
    bodyShape: null,
    job: 'lean',
    evidence: BING_STANDER_EVIDENCE,
    fixtures: rangeFixturePair({
      dress, height: [1.68, 1.88], build: [1, 1.30],
      min: { ...RANDOM_PERSON_MIN, hair: 'short' },
      max: { ...RANDOM_PERSON_MAX, hair: 'bald' },
    }),
  })),
  ...['suit', 'gown', 'shirt'].flatMap((dress) => ['stand', 'lean'].map((job) => (
    proceduralTemplate({
      id: `silver.queue.${dress}.${job}`,
      scene: 'silver_room',
      module: 'src/silver/cast.js',
      sourceFamily: 'queue',
      dress,
      gender: dress === 'gown' ? 'female' : null,
      bodyShape: dress === 'gown' ? 'curvy' : null,
      job,
      evidence: SILVER_QUEUE_EVIDENCE,
      fixtures: silverFixturePair({ dress, gown: dress === 'gown' }),
    })
  ))),
  ...['suit', 'gown'].flatMap((dress) => ['sit', 'drink'].map((job) => (
    proceduralTemplate({
      id: `silver.diner.${dress}.${job}`,
      scene: 'silver_room',
      module: 'src/silver/cast.js',
      sourceFamily: 'diner',
      dress,
      gender: dress === 'gown' ? 'female' : null,
      bodyShape: dress === 'gown' ? 'curvy' : null,
      job,
      evidence: SILVER_DINER_EVIDENCE,
      fixtures: silverFixturePair({ dress, gown: dress === 'gown', diner: true }),
    })
  ))),
  proceduralTemplate({
    id: 'silver.kitchen.chef.work',
    scene: 'silver_room',
    module: 'src/silver/cast.js',
    sourceFamily: 'kitchen-line',
    dress: 'chef',
    gender: null,
    bodyShape: null,
    job: 'work',
    evidence: SILVER_KITCHEN_EVIDENCE,
    fixtures: rangeFixturePair({
      dress: 'chef', height: [1.66, 1.84],
      min: { ...RANDOM_PERSON_MIN, hair: 'crop' },
      max: { ...RANDOM_PERSON_MAX, hair: 'short' },
    }),
  }),
  proceduralTemplate({
    id: 'silver.server.waistcoat.patrol',
    scene: 'silver_room',
    module: 'src/silver/cast.js',
    sourceFamily: 'server',
    dress: 'waistcoat',
    gender: null,
    bodyShape: null,
    job: 'patrol',
    evidence: SILVER_SERVER_EVIDENCE,
    fixtures: rangeFixturePair({
      dress: 'waistcoat', height: [1.68, 1.84],
      min: { ...RANDOM_PERSON_MIN, shirt: 0xd8d4cc, hair: 'crop' },
      max: { ...RANDOM_PERSON_MAX, shirt: 0xd8d4cc, hair: 'tied' },
    }),
  }),
  proceduralTemplate({
    id: 'silver.band.suit.stand',
    scene: 'silver_room',
    module: 'src/silver/cast.js',
    sourceFamily: 'band',
    dress: 'suit',
    gender: null,
    bodyShape: null,
    job: 'stand',
    evidence: SILVER_BAND_EVIDENCE,
    fixtures: rangeFixturePair({
      dress: 'suit', height: [1.68, 1.86], build: [0.95, 1.20],
      min: { ...RANDOM_PERSON_MIN, shirt: 0x1b1b22, hair: 'short' },
      max: { ...RANDOM_PERSON_MAX, shirt: 0x1b1b22, hair: 'tied' },
    }),
  }),
]);

/* ====================================================================== *
 * THE PEOPLE WITH NO CAMPAIGN ID
 *
 * Everybody else in this ledger is a `CHARACTER_IDS` value. These extras are
 * not — they have no lines the campaign owns, no voice profile and no save
 * flag — but they are the same body in more than one scene, which is the
 * whole reason a ledger exists, so they are in it under ids of their own.
 * The prefix is deliberate: nothing here can ever be mistaken for a campaign
 * id by a reader or by a `CHARACTER_IDS[...]` lookup.
 * ====================================================================== */

export const EXTRAS = Object.freeze({
  'staff:bartender': 'The Bada Bing\'s bartender',
  'staff:door_man': "The man on Lou's door",
  'staff:booth_man': "The man in Lou's gate booth",
  'staff:guard_0': "Lou's security — 1.86, short dark hair",
  'staff:guard_1': "Lou's security — 1.78, cropped",
  'staff:guard_2': "Lou's security — 1.90, bearded",
  'staff:guard_3': "Lou's security — 1.81, bald",
  'staff:guard_4': "Lou's security — 1.75, the heavy one",
  'staff:guard_5': "Lou's security — 1.88, cropped and bearded",
  'performer:bing_0': 'The Bada Bing platinum performer',
  'performer:bing_1': 'The Bada Bing brunette performer',
  'performer:bing_2': 'The Bada Bing black-haired performer',
  'performer:bing_3': 'The Bada Bing blonde performer',
  'squatchfather:sal': 'Sal the Prospector Sorrento',
  'squatchfather:mcclawsky': 'Captain McClawsky',
  'squatchfather:waiter': "Sorrento's waiter",
  'squatchfather:cook': "Sorrento's cook",
  'squatchfather:diner_1': "Sorrento's west diner",
  'squatchfather:diner_2': "Sorrento's east diner",
  'motel:rico': 'Rico',
  'motel:chino': 'Chino',
  'motel:slicer': 'Bathroom Seller',
  'motel:lookout': 'Lookout',
  'motel:watcher': 'Watcher',
  'motel:clerk': 'Clerk',
  'silvercase:deke': 'Deke',
  'silvercase:chester': 'Chester',
  'silvercase:winston': 'Winston',
  'silvercase:pruitt': 'Pruitt',
  'palace:guard_0': 'Cartel guard look one',
  'palace:guard_1': 'Cartel guard look two',
  'palace:guard_2': 'Cartel guard look three',
  'palace:guard_3': 'Cartel guard look four',
  'palace:mark': 'Mark',
});

/* ====================================================================== *
 * FACE PHOTOS
 *
 * Which photograph a person wears when one exists. This is NOT a claim that
 * the file is on disk — `assets/faces/index.json` is the ledger of that, and
 * every scene and the fitting room both check it before asking for a texture,
 * because a probe for a photo that has not landed is a 404 in the console.
 * ====================================================================== */

export const PHOTOS = Object.freeze({
  [CHARACTER_IDS.LOU]: 'lou.png',
  [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: 'sasole.png',
  [CHARACTER_IDS.BOOSKI]: 'booski.png',
  [CHARACTER_IDS.DEATHMEGATRON]: 'deathmegatron.png',
  [CHARACTER_IDS.APE]: 'ape.png',
  [CHARACTER_IDS.IRISH]: 'irish.png',
  [CHARACTER_IDS.GRATIN]: 'gratin.png',
  [CHARACTER_IDS.OLD_STOVE]: 'stove.png',
  [CHARACTER_IDS.ERIC]: 'erican.png',
  [CHARACTER_IDS.HOG_MAMA]: 'hogmama.png',
  [CHARACTER_IDS.SHUBENATOR]: 'shubes.png',
  [CHARACTER_IDS.RIPPINFLOW]: 'rippinflow.png',
  [CHARACTER_IDS.SNOW]: 'snow.png',
  /* Named for completeness; none of these files have landed, so everybody
   * below wears the authored head `makePerson` builds, which is a legitimate
   * look and not a placeholder. */
  [CHARACTER_IDS.WILLY]: 'willy.png',
  [CHARACTER_IDS.NUMBSKULL]: 'numbskull.png',
  [CHARACTER_IDS.AUBBIE]: 'aubbie.png',
  [CHARACTER_IDS.SAUCE]: 'sauce.png',
  [CHARACTER_IDS.SEFF]: 'seff.png',
  [CHARACTER_IDS.LAG]: 'lag.png',
  [CHARACTER_IDS.BILLY_HOTDOG]: 'billy.png',
});

/* ====================================================================== *
 * THE QUARANTINED COPIES
 *
 * Rule 2 at the top of this file. Every object below is a scene's OWN
 * clothing table copied here so the fitting room has something to build, and
 * every one of them is checked against the real scene by
 * `tests/appearances.test.mjs`. If one of these tests fails, the SCENE moved
 * and this copy is stale — bring the copy forward, do not push it back.
 * ====================================================================== */

/* ---- src/golf/cast.js's exported `GOLF_WARDROBE` ---------------------
 *
 * Four men in full traditional golf dress. The course owns each argyle
 * colourway, while `canonicalBody()` composes the named Family member's
 * height, build, skin and hair under it. The mirrors below remain data-only
 * and are deep-compared against the public export by the appearance tests. */
/* Margo's apartment-morning body is a private articulated rig and remains
 * source-only below. The ordinary Bing and Silver Room use the shared person
 * builder, so their exact body/garment literals can be shown. Her authored
 * head is still applied by `restyleMargoHead` at each production call site;
 * this data ledger neither imports nor reconstructs that protected runtime. */
const BING_MARGO = Object.freeze({
  height: 1.69, build: 0.96, dress: 'shirt', shirt: 0x24303a, hair: 'tied',
  hairColour: 0x2a1c14, skin: 0xd8a878,
  gender: 'female', bodyShape: 'curvy',
});
const SILVER_ROOM_MARGO = Object.freeze({
  height: 1.69, build: 1.06, dress: 'gown', shirt: 0x1a2a4a,
  hair: 'bald', hairColour: 0x2a1c14, skin: 0xd8a878,
  gender: 'female', bodyShape: 'curvy',
});

/* The canonical tuxedo plus the one scene-owned fact: his captors took his
 * shoes. Both the canonical base and the runtime spread are verified. */
const LICENSE_TO_GRILL_JAMES_BLOND = Object.freeze({
  ...JAMES_BLOND,
  barefoot: true,
});

const GOLF_BODY_FIELDS = Object.freeze([
  'height', 'build', 'gut', 'skin', 'hair', 'hairColour',
  'gender', 'bodyShape', 'beard', 'adult',
]);
const golfBody = (model) => Object.fromEntries(GOLF_BODY_FIELDS
  .filter((field) => Object.hasOwn(model, field))
  .map((field) => [field, model[field]]));

const GOLF_LOU = Object.freeze({
  ...golfBody(BIG_UNCLE_LOU), dress: 'argyle',
  shirt: 0x1f5138, shirtAccent: 0xf2efe2,
  argyle: Object.freeze({ a: 0xf2efe2, b: 0xe0c46a, line: 0x0b2a1c }),
  knickers: true, trouserColour: 0x7a7452, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x5e5a3e,
  chain: 'gold', chainStyle: 'single', pendant: true, pendantStyle: 'horn',
  watch: 'gold', bracelet: 'gold',
  face: 'assets/faces/lou.png', bandana: false,
});
const GOLF_RIPPINFLOW = Object.freeze({
  ...golfBody(RIPPINFLOW), dress: 'argyle',
  shirt: 0x7b3f95, shirtAccent: 0xf4f1e8,
  argyle: Object.freeze({ a: 0xf4f1e8, b: 0xf0b83c, line: 0x37134f }),
  knickers: true, trouserColour: 0x8a7f9c, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x6a4f80,
  chain: 'silver', pendant: false, watch: 'silver',
  face: 'assets/faces/rippinflow.png', bandana: false,
});
const GOLF_ERIC = Object.freeze({
  ...golfBody(ERIC), dress: 'argyle',
  shirt: 0x39465c, shirtAccent: 0xeceef2,
  argyle: Object.freeze({ a: 0xc9d3df, b: 0x8fa2bb, line: 0x161d2a }),
  knickers: true, trouserColour: 0x5c6472, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x424b5a,
  watch: 'silver',
  face: 'assets/faces/erican.png', bandana: false,
});
const GOLF_PROSPECT = Object.freeze({
  height: 1.79, build: 1.0, dress: 'argyle', hair: 'short',
  shirt: 0x8a2f34, shirtAccent: 0xf0ece0,
  argyle: Object.freeze({ a: 0x2f6b46, b: 0xe8d9a8, line: 0x2c1a18 }),
  knickers: true, trouserColour: 0x8d8a68, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x6b6a4e,
  bandana: false,
});

/* ---- src/heist/cast.js's `HEIST_CREW_PRESENTATION` -------------------
 *
 * The exported presentation now points straight at each canonical wardrobe
 * model. The scene adds its role-coloured plate carrier, mask state and face
 * without re-deciding anybody's body or base clothes. Tests import the export
 * and verify both the identity reuse and those scene-owned overlays. */
/* ---- the Bada Bing's three regulars ----------------------------------
 *
 * Seff, Old Stove and Lag are on the FAMILY roster in `src/bing/family.js`
 * with their clothes typed inline rather than in the wardrobe, because they
 * are in one building and nowhere else — which is exactly the case the
 * wardrobe's own header says does not need a canonical entry. `FAMILY` is
 * exported, so the test deep-compares these against it. */
const BING_SEFF = Object.freeze({
  height: 1.76, build: 1.0, dress: 'suit', shirt: 0x3a2a2a,
  hair: 'short', hairColour: 0x14100e, skin: 0xe8c39c,
  belt: 'leather',
});
const BING_OLD_STOVE = Object.freeze({
  height: 1.72, build: 1.1, dress: 'shirt', shirt: 0x24303a,
  hair: 'receding', hairColour: 0x9a9a9a, beard: true, skin: 0xc08a5e,
  belt: 'leather',
});
const BING_LAG = Object.freeze({
  height: 1.74, build: 0.9, dress: 'tracksuit', shirt: 0x1f3a2a,
  hair: 'crop', hairColour: 0x2a1c14, glasses: true, skin: 0xe8c39c,
});

/* ---- Lou's fixed Mansion performer variants -------------------------
 *
 * The four looks are the exported `BADA_BING_PERFORMERS` cast in
 * `src/bing/cast.js`; importing that renderer-backed module here would break
 * this ledger's data-only boundary. The Mansion then composes five FIXED
 * models from those looks: two in the suite and three at the pool. These are
 * copied exactly, and the appearance test reconstructs each production model
 * from its real post block plus the exported performer look. */
const BING_PERFORMER_LOOKS = Object.freeze([
  Object.freeze({ skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f }),
  Object.freeze({ skin: 0xe8c39c, hairColour: 0x5a3a20, hair: 'long', shirt: 0x9a4fd9 }),
  Object.freeze({ skin: 0xf2d3b4, hairColour: 0x14100e, hair: 'long', shirt: 0x4fd9c0 }),
  Object.freeze({ skin: 0xf0cba6, hairColour: 0xdcb04a, hair: 'long', shirt: 0xd94f9a }),
]);
const mansionPerformer = (height, build, index) => Object.freeze({
  role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
  height, build, dress: 'bikini', ...BING_PERFORMER_LOOKS[index],
});
const MANSION_SUITE_PERFORMER_0 = mansionPerformer(1.74, 1.08, 3);
const MANSION_SUITE_PERFORMER_1 = mansionPerformer(1.71, 1.08, 1);
const MANSION_POOL_PERFORMER_0 = mansionPerformer(1.73, 1.08, 0);
const MANSION_POOL_PERFORMER_1 = mansionPerformer(1.71, 1.06, 2);
const MANSION_POOL_PERFORMER_2 = mansionPerformer(1.70, 1.04, 1);

const SILVERCASE_APE = Object.freeze({
  ...APE_FAMILY_MEMBER.model,
  dress: 'suit', shirt: 0xf2efe7, shirtAccent: 0xf2efe7,
  jacketColour: 0x111116, trouserColour: 0x111116, tieColour: 0x09090c,
  pocketSquare: false, trim: true, trouserFit: 'creased',
  /* The Family row's work vest and silver metal stay on the club floor; the
   * Pulp Fiction suit turns them off explicitly. Mirrors the overlay in
   * src/silvercase/cast/ape.js, which the test walks field by field. */
  workVest: false, chain: false, watch: false,
  face: 'assets/faces/ape.png',
});
const SILVERCASE_DEKE = Object.freeze({
  height: 1.76, build: 1.06, dress: 'tee', hair: 'short', shirt: 0x4a5a42,
  skin: 0xd9a877, hairColour: 0x2a1e14,
});
const SILVERCASE_CHESTER = Object.freeze({
  height: 1.81, build: 1.14, gut: 0.4, dress: 'shirt', hair: 'receding',
  shirt: 0x6a3a3a, skin: 0xf0cba6, hairColour: 0x5a3a20,
});
const SILVERCASE_WINSTON = Object.freeze({
  height: 1.71, build: 0.94, dress: 'shirt', hair: 'crop', shirt: 0xc9c2a8,
  skin: 0x8d5a3a, hairColour: 0x141014,
});
const SILVERCASE_PRUITT = Object.freeze({
  height: 1.84, build: 1.2, dress: 'tracksuit', hair: 'crop', beard: true,
  shirt: 0x3a3a42, skin: 0xc99268, hairColour: 0x141014,
});

const PALACE_GUARD_LOOKS = Object.freeze([
  Object.freeze({ height: 1.79, build: 1.14, dress: 'work', shirt: 0x2a2e26, hair: 'crop', skin: 0xb87a4e, bandana: true }),
  Object.freeze({ height: 1.72, build: 1.06, dress: 'work', shirt: 0x24281f, hair: 'short', skin: 0x8d5a3a, bandana: true }),
  Object.freeze({ height: 1.86, build: 1.24, dress: 'work', shirt: 0x1b1e22, hair: 'bald', skin: 0xc08a5e, beard: true, bandana: true }),
  Object.freeze({ height: 1.75, build: 1.32, dress: 'work', shirt: 0x32372e, hair: 'crop', skin: 0xd9a97f, bandana: true }),
]);
const PALACE_MARK = Object.freeze({
  height: 1.9, build: 1.34, dress: 'suit', shirt: 0x16191c,
  hair: 'short', hairColour: 0x17110e, skin: 0xac744e, beard: true,
  belt: 'leather', watch: 'gold', threePiece: true,
});

/* ====================================================================== *
 * THE ROWS
 *
 * Each row is:
 *
 *   character   a CHARACTER_IDS value, or an `EXTRAS` key
 *   name        what to call him on screen
 *   scene       a SCENES key
 *   where       WHERE IN THE SCENE HE IS, in words. The one hand-written
 *               field in the file. It cannot go dangerously stale — a man in
 *               the wrong described chair is a nuisance, not a wrong outfit —
 *               and there is no way to derive "on a stool at the bar, by the
 *               service station" from an x and a z.
 *   model       what he has on. See rules 1 and 2 at the top.
 *   from        how the test proves the row:
 *                 { wardrobe: 'NAME' }        `model` IS that core/wardrobe.js
 *                                             export, by identity
 *                 { module, export, at }      `model` is deep-equal to that
 *                                             module's export, walked by `at`
 *                 { canonicalBody: 'NAME' }  an exported scene outfit
 *                                             composes that wardrobe body's
 *                                             identity-bearing fields
 *                 { module, source: true }    the module types it inline; the
 *                                             copy above is checked field by
 *                                             field against the source
 *                 { module, unshown: 'why' }  the scene builds him on a rig
 *                                             this room cannot draw
 *   module      which of the scene's modules dresses him
 *   evidence    a literal substring of that module's source that puts him
 *               there. Rule 3.
 *   rig         'person' — the club's `makePerson`, which is what the
 *               fitting room builds — or 'block', the Beef Run's `makeFigure`
 *   divergence  optional intentional or unresolved scene difference
 *   divergenceStatus  `none`, `intentional`, or `unresolved`; the audit and
 *               browser verifier refuse to ship the last state
 * ====================================================================== */

/** Freeze a row and make every cross-scene difference an explicit decision. */
const row = (o) => Object.freeze({
  rig: 'person',
  divergence: null,
  divergenceStatus: o.divergence ? 'unresolved' : 'none',
  ...o,
});

/* ---------------------------------------------------------------------- *
 * THE BADA BING — an ordinary night
 *
 * `src/bing/family.js` seats the roster; `src/bing/cast.js` staffs the
 * building. Every model on the floor is `WARDROBE.<id>`, which is the same
 * frozen object as the export named below it, so these rows are rule 1 all
 * the way down.
 * ---------------------------------------------------------------------- */

const BING_FLOOR = [
  [CHARACTER_IDS.BOOSKI, 'Booskibro', 'at the bar by the service station, on the stool', BOOSKI, 'BOOSKI'],
  [CHARACTER_IDS.DEATHMEGATRON, 'DeathMegatron', 'two stools down from Booski, with the spritz', DEATHMEGATRON, 'DEATHMEGATRON'],
  [CHARACTER_IDS.IRISH, 'Irish', 'an east booth, mid-story, sharing with a regular', IRISH, 'IRISH'],
  [CHARACTER_IDS.GRATIN, 'Gratin', 'his own east booth, near the kitchen door', GRATIN, 'GRATIN'],
  [CHARACTER_IDS.ERIC, 'Eric', 'the north booth with Lag', ERIC, 'ERIC'],
  [CHARACTER_IDS.WILLY, 'Willy', 'seat one of five at the blackjack felt — the best one', WILLY, 'WILLY'],
  [CHARACTER_IDS.HOG_MAMA, 'Hog Mama', 'a two-top near the stage, working the floor', HOG_MAMA, 'HOG_MAMA'],
  [CHARACTER_IDS.SHUBENATOR, 'The Shubenator', 'another stage two-top, nine hundred push-ups deep', SHUBENATOR, 'SHUBENATOR'],
  [CHARACTER_IDS.RIPPINFLOW, 'Rippinflow', 'stage-side two-top, doing it again anyway', RIPPINFLOW, 'RIPPINFLOW'],
  [CHARACTER_IDS.CAPTAIN_LOU_SASOLE, 'Captain Lou Sasole', 'a stage two-top — present only once the Beef Run has been flown', CAPTAIN_LOU_SASOLE, 'CAPTAIN_LOU_SASOLE'],
  [CHARACTER_IDS.SNOW, 'Snow', 'the back hallway, north of the men\'s room door, arms folded', SNOW, 'SNOW'],
  [CHARACTER_IDS.NUMBSKULL, 'Numbskull', 'standing over the slot machine like it needs the muscle', NUMBSKULL, 'NUMBSKULL'],
  [CHARACTER_IDS.AUBBIE, 'Aubbie', 'stool zero, the quiet south end of the bar, coat still on', AUBBIE, 'AUBBIE'],
  [CHARACTER_IDS.SAUCE, 'Sauce', 'the east chair of the two-top with the runway in front of it', SAUCE, 'SAUCE'],
].map(([character, name, where, model, symbol]) => row({
  character,
  name,
  scene: 'bada_bing',
  where,
  model,
  from: { wardrobe: symbol },
  module: 'src/bing/family.js',
  evidence: `model: WARDROBE.${character},`,
}));

/* ---------------------------------------------------------------------- *
 * THE CLOSED PARTY
 *
 * `buildHotDogParty` calls `populateFamily` with the whole roster minus
 * Aubbie and Sauce (who it builds itself, as figures with business), then
 * moves everybody onto a party spot. Nobody's clothes change — the party is
 * a seating change, which is the correct thing for it to be — so every row
 * below points at the same model its Bing row does, and its evidence is the
 * spot the party actually gives the man.
 * ---------------------------------------------------------------------- */

/* The party never names a wardrobe export for these twelve: it takes the
 * roster whole (`FAMILY.filter(...)` into `populateFamily`) and only moves
 * them. So the row is proved against `FAMILY` rather than against the
 * wardrobe — which is the same frozen object by a different route, and is the
 * route the scene actually takes. */
const PARTY_FLOOR = [
  [CHARACTER_IDS.BOOSKI, 'Booskibro', 'BOOSKI', 'by the bar, north end', BOOSKI],
  [CHARACTER_IDS.DEATHMEGATRON, 'DeathMegatron', 'DEATHMEGATRON', 'by the bar, south end', DEATHMEGATRON],
  [CHARACTER_IDS.IRISH, 'Irish', 'IRISH', 'the east side of the room, facing the stage', IRISH],
  [CHARACTER_IDS.GRATIN, 'Gratin', 'GRATIN', 'east, near the kitchen door', GRATIN],
  [CHARACTER_IDS.ERIC, 'Eric', 'ERIC', 'mid-floor with the camcorder on his shoulder', ERIC],
  [CHARACTER_IDS.WILLY, 'Willy', 'WILLY', 'up by the bar, north', WILLY],
  [CHARACTER_IDS.HOG_MAMA, 'Hog Mama', 'HOG_MAMA', 'on the stage itself', HOG_MAMA],
  [CHARACTER_IDS.SHUBENATOR, 'The Shubenator', 'SHUBENATOR', 'south-east of the runway', SHUBENATOR],
  [CHARACTER_IDS.RIPPINFLOW, 'Rippinflow', 'RIPPINFLOW', 'mid-floor, stage left', RIPPINFLOW],
  [CHARACTER_IDS.CAPTAIN_LOU_SASOLE, 'Captain Lou Sasole', 'CAPTAIN_LOU_SASOLE', 'mid-floor, facing the stage', CAPTAIN_LOU_SASOLE],
  [CHARACTER_IDS.SNOW, 'Snow', 'SNOW', 'the far east side, where the work will be', SNOW],
  [CHARACTER_IDS.NUMBSKULL, 'Numbskull', 'NUMBSKULL', 'centre floor', NUMBSKULL],
].map(([character, name, symbol, where, model]) => row({
  character,
  name,
  scene: 'bing_party',
  where,
  model,
  from: { module: 'src/bing/family.js', export: 'FAMILY', at: [character, 'model'] },
  module: 'src/bing/hotdog-party.js',
  evidence: `[CHARACTER_IDS.${symbol}]: [`,
}));

export const APPEARANCES = Object.freeze([

  /* Margo's apartment figure is not makePerson: it has its own articulated
   * blouse/jeans/shoes rig for the authored morning poses. Catalog it without
   * crossing the protected Margo/date boundary or inventing a translation. */
  row({
    character: CHARACTER_IDS.MARGO,
    name: 'Margo',
    scene: 'apartment',
    where: 'the bedroom and apartment during the morning-after sequence',
    model: null,
    rig: 'block',
    from: {
      module: 'src/world/dressing.js',
      unshown: 'A fixed private articulated blouse/jeans/shoes rig with the shared Margo head restyle; translating it onto makePerson would not be the production figure.',
    },
    module: 'src/world/dressing.js',
    evidence: 'export function makeMorningGuest(M) {',
  }),

  /* ================================================================== *
   * BIG UNCLE LOU, FOUR WAYS
   *
   * The reason this file exists. Same man, same jewellery, four outfits,
   * four modules, and until now no way to see them together.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'bada_bing',
    where: 'his office upstairs, behind the desk under the lamp',
    model: BIG_UNCLE_LOU_BING,
    from: { wardrobe: 'BIG_UNCLE_LOU_BING' },
    module: 'src/bing/cast.js',
    evidence: '...BIG_UNCLE_LOU_BING,',
    /* The chalk-stripe three-piece with the jacket OPEN over the waistcoat,
     * plus the fedora. The openness is the outfit's whole argument: it is
     * what puts the corno somewhere a man across the desk can see it. */
  }),
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'bing_party',
    where: 'the north end of the floor, beside Billy HotDog',
    model: BIG_UNCLE_LOU_BING,
    from: { wardrobe: 'BIG_UNCLE_LOU_BING' },
    module: 'src/bing/hotdog-party.js',
    evidence: 'model: { ...BIG_UNCLE_LOU_BING, face: faces.has(\'lou.png\')',
  }),
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'no_wake',
    where: 'the foredeck, standing, facing aft at Willy',
    model: BIG_UNCLE_LOU,
    from: { wardrobe: 'BIG_UNCLE_LOU' },
    module: 'src/nowake/world.js',
    evidence: 'model: { ...BIG_UNCLE_LOU, face: \'assets/faces/lou.png\' },',
  }),
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'golf',
    where: 'the tee, first of the foursome',
    model: GOLF_LOU,
    from: { module: 'src/golf/cast.js', export: 'GOLF_WARDROBE', at: [CHARACTER_IDS.LOU], canonicalBody: 'BIG_UNCLE_LOU' },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.LOU]: Object.freeze({',
  }),
  /* THE SECOND LOU IN THIS OFFICE IS GONE, and finding him is what this whole
   * ledger was for.
   *
   * There were two. `MansionInterior.js` sat one in the red carver in
   * `BIG_UNCLE_LOU_MANSION`; `cast.js` stood another behind the same desk in
   * the plain suit; `main.js` mounted both unconditionally, 1.7 m apart, with
   * one face photo between them. Neither pass could see the other — the
   * building file's own note says the house "has had Lou's name on four things
   * in it and Lou in none of them", which was true when it was written, and
   * `cast.js` posted him a pass later answering "none of the characters are
   * here". A duplicate is invisible in a diff and obvious in a doorway.
   *
   * The seated one was removed, because this project's line is that
   * `MansionInterior.js` is the building and `cast.js` is the people, and the
   * survivor is the one the mission talks to.
   *
   * AND THE SURVIVOR IS NOW IN THE RIGHT CLOTHES. This row used to carry a
   * `divergence` saying `BIG_UNCLE_LOU_MANSION` was "now worn by nobody" and
   * that whoever posts him should reach for it. The owner read the same thing
   * off the screen — "Lou should wear the other outfit" — and `cast.js` now
   * does exactly that. The divergence is gone because the defect is gone; the
   * siege's row below still carries its own, and it is the siege's to answer.
   */
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'mansion_house',
    where: 'his office, standing behind the desk, facing the door',
    model: BIG_UNCLE_LOU_MANSION,
    from: { wardrobe: 'BIG_UNCLE_LOU_MANSION' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(BIG_UNCLE_LOU_MANSION, FACES.lou),',
  }),
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'mansion_siege',
    where: 'the desk end of his own office, on the telephone',
    model: BIG_UNCLE_LOU_MANSION,
    from: { wardrobe: 'BIG_UNCLE_LOU_MANSION' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(BIG_UNCLE_LOU_MANSION, FACES.lou),',
  }),

  /* ================================================================== *
   * CAPTAIN LOU SASOLE — the OTHER Lou
   *
   * `lou2`, `sasole.png`, a sage flight jacket and a silver watch. He is
   * kept immediately below Big Uncle Lou here for the same reason
   * src/core/wardrobe.js keeps their bodies adjacent: so that nobody
   * merges them by accident. They are both in the mansion on the same
   * night, four floors apart.
   * ================================================================== */

  ...BING_FLOOR.filter((e) => e.character === CHARACTER_IDS.CAPTAIN_LOU_SASOLE),
  row({
    character: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    name: 'Captain Lou Sasole',
    scene: 'mansion_house',
    where: 'a stool at the bay bar, opposite the bartender, drinking alone',
    model: CAPTAIN_LOU_SASOLE,
    from: { wardrobe: 'CAPTAIN_LOU_SASOLE' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(CAPTAIN_LOU_SASOLE, FACES.sasole),',
  }),
  row({
    character: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    name: 'Captain Lou Sasole',
    scene: 'mansion_siege',
    where: 'the bay bar he was already sitting at, now behind it',
    model: CAPTAIN_LOU_SASOLE,
    from: { wardrobe: 'CAPTAIN_LOU_SASOLE' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(CAPTAIN_LOU_SASOLE, FACES.sasole),',
  }),
  row({
    character: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    name: 'Captain Lou Sasole',
    scene: 'beef_run',
    where: 'Whispering Pines, leaning on the aeroplane with a coffee',
    model: CAPTAIN_LOU_SASOLE,
    from: { wardrobe: 'CAPTAIN_LOU_SASOLE' },
    module: 'src/beefrun/npc.js',
    evidence: '...fromWardrobe(CAPTAIN_LOU_SASOLE),',
    rig: 'block',
    /* `fromWardrobe()` reads the canonical record and maps it onto the block
     * rig's own vocabulary — colours, dress, patches, belt, watch and a build
     * remapped from the Family's 1.10 scale onto the rig's 0..1. So the
     * OUTFIT is canonical and the SILHOUETTE is not the club's. */
  }),
  row({
    character: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    name: 'Captain Lou Sasole',
    scene: 'enola_squatch',
    where: "the left seat, and the port gear leg during the walkaround",
    model: CAPTAIN_LOU_SASOLE,
    from: { wardrobe: 'CAPTAIN_LOU_SASOLE' },
    module: 'src/enolasquatch/crew.js',
    evidence: '...fromWardrobe(CAPTAIN_LOU_SASOLE),',
    rig: 'block',
  }),

  /* ================================================================== *
   * THE FLOOR OF THE CLUB
   * ================================================================== */

  ...BING_FLOOR.filter((e) => e.character !== CHARACTER_IDS.CAPTAIN_LOU_SASOLE),

  row({
    character: CHARACTER_IDS.APE,
    name: 'Ape',
    scene: 'bada_bing',
    where: 'standing off the runway, arms folded',
    model: APE_FAMILY_MEMBER.model,
    from: { module: 'src/bing/family-ape.js', export: 'APE_FAMILY_MEMBER', at: ['model'] },
    module: 'src/bing/family.js',
    evidence: '  APE_FAMILY_MEMBER,',
    /* His figure is canon and lives in family-ape.js rather than in the
     * wardrobe, because the scenes that need him also need his knife, his
     * routes and his signature takes. Same argument, different file. */
  }),
  row({
    character: CHARACTER_IDS.SEFF,
    name: 'Seff',
    scene: 'bada_bing',
    where: 'the far end of the bar, waiting for his situation to clear',
    model: BING_SEFF,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.SEFF, 'model'] },
    module: 'src/bing/family.js',
    evidence: 'id: CHARACTER_IDS.SEFF,',
  }),
  row({
    character: CHARACTER_IDS.OLD_STOVE,
    name: 'Old Stove',
    scene: 'bada_bing',
    where: 'the short booth by the slot alcove, complaining about the ice',
    model: BING_OLD_STOVE,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.OLD_STOVE, 'model'] },
    module: 'src/bing/family.js',
    evidence: 'id: CHARACTER_IDS.OLD_STOVE,',
  }),
  row({
    character: CHARACTER_IDS.LAG,
    name: 'Lag',
    scene: 'bada_bing',
    where: 'the north booth with Eric, watching the lights flicker',
    model: BING_LAG,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.LAG, 'model'] },
    module: 'src/bing/family.js',
    evidence: 'id: CHARACTER_IDS.LAG,',
  }),
  row({
    character: 'staff:bartender',
    name: 'The bartender',
    scene: 'bada_bing',
    where: 'behind his own bar, working',
    model: BADA_BING_BARTENDER,
    from: { wardrobe: 'BADA_BING_BARTENDER' },
    module: 'src/bing/cast.js',
    evidence: 'model: { ...BADA_BING_BARTENDER },',
    /* The waistcoat is the whole read: he is the only person in either
     * building dressed by an employer rather than by himself. */
  }),
  row({
    character: CHARACTER_IDS.MARGO,
    name: 'Margo',
    scene: 'bada_bing',
    where: 'the last bar stool, on her own with a rye, during the first visit',
    model: BING_MARGO,
    from: {
      module: 'src/bing/cast.js', source: true, containing: true,
      restyledHead: 'restyleMargoHead(by.margo.parts,',
    },
    module: 'src/bing/cast.js',
    evidence: "height: 1.69, build: 0.96, dress: 'shirt', shirt: 0x24303a, hair: 'tied',",
    previewNote: 'The fitting room shows the exact production outfit/body literal; her protected authored head restyle remains scene-owned.',
  }),
  row({
    character: CHARACTER_IDS.JAMES_BLOND,
    name: 'James Blond',
    scene: 'bada_bing',
    variant: 'license_to_grill',
    where: 'tied to the chair in the License to Grill store room',
    model: LICENSE_TO_GRILL_JAMES_BLOND,
    from: {
      module: 'src/bing/license-to-grill-runtime.js',
      baseWardrobe: 'JAMES_BLOND',
      adds: ['barefoot'],
    },
    module: 'src/bing/license-to-grill-runtime.js',
    evidence: 'model: { ...WARDROBE.james_blond, barefoot: true },',
  }),

  /* ================================================================== *
   * THE CLOSED PARTY
   * ================================================================== */

  ...PARTY_FLOOR,

  row({
    character: CHARACTER_IDS.APE,
    name: 'Ape',
    scene: 'bing_party',
    where: 'centre floor with the knife, which is the point of the evening',
    model: APE_FAMILY_MEMBER.model,
    from: { module: 'src/bing/family-ape.js', export: 'APE_FAMILY_MEMBER', at: ['model'] },
    module: 'src/bing/hotdog-party.js',
    evidence: '[CHARACTER_IDS.APE]: [',
  }),
  row({
    character: CHARACTER_IDS.SEFF,
    name: 'Seff',
    scene: 'bing_party',
    where: 'the east wall',
    model: BING_SEFF,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.SEFF, 'model'] },
    module: 'src/bing/hotdog-party.js',
    evidence: '[CHARACTER_IDS.SEFF]: [',
  }),
  row({
    character: CHARACTER_IDS.OLD_STOVE,
    name: 'Old Stove',
    scene: 'bing_party',
    where: 'the east wall, up by the slots',
    model: BING_OLD_STOVE,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.OLD_STOVE, 'model'] },
    module: 'src/bing/hotdog-party.js',
    evidence: '[CHARACTER_IDS.OLD_STOVE]: [',
  }),
  row({
    character: CHARACTER_IDS.LAG,
    name: 'Lag',
    scene: 'bing_party',
    where: 'the north-east corner',
    model: BING_LAG,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.LAG, 'model'] },
    module: 'src/bing/hotdog-party.js',
    evidence: '[CHARACTER_IDS.LAG]: [',
  }),
  row({
    character: CHARACTER_IDS.AUBBIE,
    name: 'Aubbie',
    scene: 'bing_party',
    where: 'the east side with his tool pouch, arms folded, one drink in',
    model: AUBBIE,
    from: { wardrobe: 'AUBBIE' },
    module: 'src/bing/hotdog-party.js',
    evidence: 'model: AUBBIE,',
  }),
  row({
    character: CHARACTER_IDS.SAUCE,
    name: 'Sauce',
    scene: 'bing_party',
    where: 'working the buffet, in the same whites he sits at his two-top in',
    model: SAUCE,
    from: { wardrobe: 'SAUCE' },
    module: 'src/bing/hotdog-party.js',
    evidence: 'model: SAUCE,',
  }),
  row({
    character: CHARACTER_IDS.BILLY_HOTDOG,
    name: 'Billy HotDog',
    scene: 'bing_party',
    where: 'standing in front of Lou, an hour from the trunk',
    model: BILLY_HOTDOG_MODEL,
    from: { module: 'src/core/hotdog-model.js', export: 'BILLY_HOTDOG_MODEL', at: [] },
    module: 'src/bing/hotdog-party.js',
    evidence: 'model: BILLY_HOTDOG_MODEL,',
    /* Canonical for exactly one reason: the body in the trunk has to be
     * visibly the man you watched go down. */
  }),

  /* ================================================================== *
   * NO WAKE — the boat
   *
   * The three who go out and the one who does not come back. Only Lou is
   * dressed from the wardrobe by name here; Booski, Willy and Irish come
   * through the Bing roster — `source[CHARACTER_IDS.X].model`, where
   * `source` is `FAMILY` indexed by id — so their rows are proved against
   * `FAMILY`. Same frozen object, different route, and the route is the
   * thing a test has to follow.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.BOOSKI,
    name: 'Booskibro',
    scene: 'no_wake',
    where: 'the foredeck, port side, beside Lou',
    model: BOOSKI,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.BOOSKI, 'model'] },
    module: 'src/nowake/world.js',
    evidence: '...source[CHARACTER_IDS.BOOSKI].model',
  }),
  row({
    character: CHARACTER_IDS.WILLY,
    name: 'Willy',
    scene: 'no_wake',
    where: 'sitting on the aft bench, which is where he stays',
    model: WILLY,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.WILLY, 'model'] },
    module: 'src/nowake/world.js',
    evidence: '...source[CHARACTER_IDS.WILLY].model',
    /* His last scene. He is on the Bing floor before this and in nothing
     * after it — `familyPresent()` drops him once NO WAKE is complete, and
     * the mansion arc is deliberately empty of him. */
  }),
  row({
    character: CHARACTER_IDS.IRISH,
    name: 'Irish',
    scene: 'no_wake',
    where: 'forward and to port, well clear of the boarding line',
    model: IRISH,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.IRISH, 'model'] },
    module: 'src/nowake/world.js',
    evidence: '...source[CHARACTER_IDS.IRISH].model',
  }),

  /* ================================================================== *
   * THE GRAVEYARD
   * ================================================================== */

  row({
    character: CHARACTER_IDS.SNOW,
    name: 'Snow',
    scene: 'graveyard',
    where: 'beside the open plot with a shovel, a key ring and a flashlight',
    model: SNOW,
    from: { wardrobe: 'SNOW' },
    module: 'src/graveyard/world.js',
    evidence: '...SNOW,',
  }),
  row({
    character: CHARACTER_IDS.BILLY_HOTDOG,
    name: 'Billy HotDog',
    scene: 'graveyard',
    where: 'in the trunk, then in the ground — wrapped, not dressed',
    model: BILLY_HOTDOG_MODEL,
    from: { module: 'src/core/hotdog-model.js', export: 'BILLY_HOTDOG_MODEL', at: [] },
    module: 'src/graveyard/world.js',
    evidence: 'BILLY_HOTDOG_MODEL.height + 0.1,',
    /* NOT A DRESSED FIGURE. `hotDogBody()` builds a wrapped bundle SIZED off
     * the canonical model — his height plus pointed toes, his build — and the
     * dark mass inside the sheeting is the colour of the suit he was killed
     * in. The fitting room shows the model the bundle is measured from, which
     * is what a note about this prop would be made against. */
  }),

  /* ================================================================== *
   * GOLF — Thursday morning
   * ================================================================== */

  row({
    character: CHARACTER_IDS.RIPPINFLOW,
    name: 'Rippinflow',
    scene: 'golf',
    where: 'the tee, second of the foursome',
    model: GOLF_RIPPINFLOW,
    from: { module: 'src/golf/cast.js', export: 'GOLF_WARDROBE', at: [CHARACTER_IDS.RIPPINFLOW], canonicalBody: 'RIPPINFLOW' },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.RIPPINFLOW]: Object.freeze({',
    /* The thin silver line and nothing hanging off it, exactly as everywhere
     * else — the one thing this table does carry over from the wardrobe. */
  }),
  row({
    character: CHARACTER_IDS.ERIC,
    name: 'Eric',
    scene: 'golf',
    where: 'the tee, third of the foursome',
    model: GOLF_ERIC,
    from: { module: 'src/golf/cast.js', export: 'GOLF_WARDROBE', at: [CHARACTER_IDS.ERIC], canonicalBody: 'ERIC' },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.ERIC]: Object.freeze({',
  }),
  row({
    character: CHARACTER_IDS.PROSPECT,
    name: 'Tony Squatchtana (the Prospect)',
    scene: 'golf',
    where: 'the tee, in whatever the pro shop had',
    model: GOLF_PROSPECT,
    from: { module: 'src/golf/cast.js', export: 'GOLF_WARDROBE', at: [CHARACTER_IDS.PROSPECT] },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.PROSPECT]: Object.freeze({',
    /* THE ONLY PLACE IN THE LEDGER THE PLAYER HAS A BODY. Everywhere else he
     * is a first-person camera with a pair of hands, so there is nothing to
     * put on a stand. */
  }),

  /* ================================================================== *
   * THE SILVER ROOM
   * ================================================================== */

  row({
    character: CHARACTER_IDS.MARGO,
    name: 'Margo',
    scene: 'silver_room',
    where: 'beside Tony from drop-off through dinner and the walk out',
    model: SILVER_ROOM_MARGO,
    from: {
      module: 'src/silver/date.js', source: true, containing: true,
      restyledHead: 'restyleMargoHead(this.npc.parts,',
    },
    module: 'src/silver/date.js',
    evidence: "height: 1.69, build: 1.06, dress: 'gown', shirt: 0x1a2a4a,",
    previewNote: 'The fitting room shows the exact navy gown/body literal; her protected authored head restyle remains scene-owned.',
  }),

  row({
    character: CHARACTER_IDS.APE,
    name: 'Ape',
    scene: 'silver_room',
    where: 'the four-top by the pillar, sending the champagne',
    model: APE_FAMILY_MEMBER.model,
    from: { module: 'src/bing/family-ape.js', export: 'APE_FAMILY_MEMBER', at: ['model'] },
    module: 'src/silver/cast.js',
    evidence: '[CHARACTER_IDS.APE, APE.subtitleName, SILVER_APE_PRESENTATION.model],',
    /* The exact Bing figure and face, not a Silver Room approximation. Only
     * his seat and his behaviour belong to this room. */
  }),

  /* ================================================================== *
   * THE TAKE — the bank job
   *
   * Canonical bodies and base clothes under role-coloured plate carriers and
   * mission masks. The overlays remain scene-owned; identity does not.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.SNOW,
    name: 'Snow',
    scene: 'bank_heist',
    where: 'the safehouse, west of the table — he leads this one',
    model: SNOW,
    from: { wardrobe: 'SNOW', module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', at: [CHARACTER_IDS.SNOW, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.SNOW]: Object.freeze({',
    previewNote: 'The fitting room shows Snow\'s canonical body and work clothes; the plate carrier and mission mask are scene-owned overlays.',
  }),
  row({
    character: CHARACTER_IDS.RIPPINFLOW,
    name: 'Rippinflow',
    scene: 'bank_heist',
    where: 'the safehouse, on the driver\'s side',
    model: RIPPINFLOW,
    from: { wardrobe: 'RIPPINFLOW', module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', at: [CHARACTER_IDS.RIPPINFLOW, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.RIPPINFLOW]: Object.freeze({',
    previewNote: 'The fitting room shows Rippinflow\'s canonical body; the driver-role plate carrier and mission mask are scene-owned overlays.',
  }),
  row({
    character: CHARACTER_IDS.SHUBENATOR,
    name: 'The Shubenator',
    scene: 'bank_heist',
    where: 'the safehouse, centre — the technical',
    model: SHUBENATOR,
    from: { wardrobe: 'SHUBENATOR', module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', at: [CHARACTER_IDS.SHUBENATOR, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.SHUBENATOR]: Object.freeze({',
    previewNote: 'The fitting room shows the canonical body; the technical-role plate carrier and mission mask are scene-owned overlays.',
  }),
  row({
    character: CHARACTER_IDS.DEATHMEGATRON,
    name: 'DeathMegatron',
    scene: 'bank_heist',
    where: 'the safehouse, east — the heavy, with the carbine',
    model: DEATHMEGATRON,
    from: { wardrobe: 'DEATHMEGATRON', module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', at: [CHARACTER_IDS.DEATHMEGATRON, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.DEATHMEGATRON]: Object.freeze({',
    previewNote: 'The fitting room shows DeathMegatron\'s canonical curvy body; the heavy-role plate carrier and mission mask are scene-owned overlays.',
  }),
  row({
    character: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    scene: 'bank_heist',
    where: 'the safehouse, far east — on control',
    model: NUMBSKULL,
    from: { wardrobe: 'NUMBSKULL', module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', at: [CHARACTER_IDS.NUMBSKULL, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.NUMBSKULL]: Object.freeze({',
    previewNote: 'The fitting room shows Numbskull\'s canonical body; round glasses, the control-role plate carrier and mission mask are scene-owned overlays.',
  }),

  /* ================================================================== *
   * LOU'S MANSION — the house
   *
   * Both Lous have their rows above. This is everybody else, in the order
   * the player meets them: the door, the grounds, the stairs, the cellar,
   * the vault, the bar, the foyer, then the family using the house.
   * ================================================================== */

  row({
    character: 'staff:door_man',
    name: 'The man on the door',
    scene: 'mansion_house',
    where: 'the portico, beside the doors, facing down the steps',
    model: MANSION_DOOR_MAN,
    from: { wardrobe: 'MANSION_DOOR_MAN' },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_DOOR_MAN,',
    /* The same uniform as the rest, one grade sharper — he is the only one
     * of them who is allowed to turn you around. */
  }),
  row({
    character: 'staff:booth_man',
    name: EXTRAS['staff:booth_man'],
    scene: 'mansion_house',
    where: 'inside the security booth at the street gate, at the counter',
    model: MANSION_BOOTH_MAN,
    from: { wardrobe: 'MANSION_BOOTH_MAN' },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_BOOTH_MAN,',
    /* Same uniform, same throat as the door man (`mansion-gate`), and
     * deliberately NOT one of MANSION_GUARDS — those six are posted elsewhere
     * in the same house and reusing one would put a man in two places. */
  }),
  ...[0, 1, 2].map((i) => row({
    character: `staff:guard_${i}`,
    name: EXTRAS[`staff:guard_${i}`],
    scene: 'mansion_house',
    where: `walking the perimeter, route ${i + 1} of three`,
    model: MANSION_GUARDS[i],
    from: { wardrobe: `MANSION_GUARDS[${i}]` },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_GUARDS[i],',
  })),
  row({
    character: 'staff:guard_3',
    name: EXTRAS['staff:guard_3'],
    scene: 'mansion_house',
    where: 'the balcony rail at the head of the horseshoe, watching the doors',
    model: MANSION_GUARDS[3],
    from: { wardrobe: 'MANSION_GUARDS[3]' },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_GUARDS[3],',
  }),
  row({
    character: 'staff:guard_4',
    name: EXTRAS['staff:guard_4'],
    scene: 'mansion_house',
    where: 'the cellar, arms folded, watching a television with the sound off',
    model: MANSION_GUARDS[4],
    from: { wardrobe: 'MANSION_GUARDS[4]' },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_GUARDS[4],',
  }),
  row({
    character: 'staff:guard_5',
    name: EXTRAS['staff:guard_5'],
    scene: 'mansion_house',
    where: 'the cellar hall, between you and a vault door nobody closed',
    model: MANSION_GUARDS[5],
    from: { wardrobe: 'MANSION_GUARDS[5]' },
    module: 'src/mansion/cast.js',
    evidence: 'model: MANSION_GUARDS[5],',
  }),
  row({
    character: 'staff:bartender',
    name: 'The bartender',
    scene: 'mansion_house',
    where: 'the service end of the bay bar, working a private room',
    model: BADA_BING_BARTENDER,
    from: { wardrobe: 'BADA_BING_BARTENDER' },
    module: 'src/mansion/cast.js',
    evidence: 'model: BADA_BING_BARTENDER,',
    /* The reason his body moved into the wardrobe at all: Lou's house borrows
     * the Bing's bartender for the night and there is only one of him. */
  }),
  row({
    character: CHARACTER_IDS.SEFF,
    name: 'Seff',
    scene: 'mansion_house',
    where: 'the conference room on the phone; theatre recliner three after the mission',
    model: BING_SEFF,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.SEFF, 'model'] },
    module: 'src/mansion/cast.js',
    evidence: 'model: familyModel(CHARACTER_IDS.SEFF),',
  }),
  row({
    character: CHARACTER_IDS.LAG,
    name: 'Lag',
    scene: 'mansion_house',
    where: 'the basement LAN room; theatre recliner five after the mission',
    model: BING_LAG,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.LAG, 'model'] },
    module: 'src/mansion/cast.js',
    evidence: 'model: familyModel(CHARACTER_IDS.LAG),',
  }),
  row({
    character: CHARACTER_IDS.APE,
    name: 'Ape',
    scene: 'mansion_house',
    where: 'the ballroom edge, arms folded',
    model: APE_FAMILY_MEMBER.model,
    from: { module: 'src/bing/family-ape.js', export: 'APE_FAMILY_MEMBER', at: ['model'] },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(familyModel(CHARACTER_IDS.APE), FACES.ape),',
  }),
  row({
    character: CHARACTER_IDS.SAUCE,
    name: 'Sauce',
    scene: 'mansion_house',
    where: 'working the ballroom buffet in chef whites',
    model: SAUCE,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.SAUCE, 'model'] },
    module: 'src/mansion/cast.js',
    evidence: 'model: familyModel(CHARACTER_IDS.SAUCE),',
  }),
  row({
    character: CHARACTER_IDS.OLD_STOVE,
    name: 'Old Stove',
    scene: 'mansion_house',
    where: 'theatre recliner one, seated for the movie',
    model: BING_OLD_STOVE,
    from: { module: 'src/bing/family.js', export: 'FAMILY', at: [CHARACTER_IDS.OLD_STOVE, 'model'] },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(familyModel(CHARACTER_IDS.OLD_STOVE), FACES.stove),',
  }),
  row({
    character: 'performer:bing_3',
    name: EXTRAS['performer:bing_3'],
    scene: 'mansion_house',
    variant: 'suitePerformer0',
    where: 'the first seat inside the master-suite hot tub',
    model: MANSION_SUITE_PERFORMER_0,
    from: { mansionPerformer: { post: 'suitePerformer0', index: 3 } },
    module: 'src/mansion/cast.js',
    evidence: "post(`suitePerformer${i}`, {",
  }),
  row({
    character: 'performer:bing_1',
    name: EXTRAS['performer:bing_1'],
    scene: 'mansion_house',
    variant: 'suitePerformer1',
    where: 'the second seat inside the master-suite hot tub',
    model: MANSION_SUITE_PERFORMER_1,
    from: { mansionPerformer: { post: 'suitePerformer1', index: 1 } },
    module: 'src/mansion/cast.js',
    evidence: "post(`suitePerformer${i}`, {",
  }),
  row({
    character: 'performer:bing_0',
    name: EXTRAS['performer:bing_0'],
    scene: 'mansion_house',
    variant: 'poolPerformer0',
    where: 'reclined on pool lounger four, with the first dress-strap interaction',
    model: MANSION_POOL_PERFORMER_0,
    from: { mansionPerformer: { post: 'poolPerformer0', index: 0 } },
    module: 'src/mansion/cast.js',
    evidence: "const primaryPoolGirl = post('poolPerformer0', {",
  }),
  row({
    character: 'performer:bing_2',
    name: EXTRAS['performer:bing_2'],
    scene: 'mansion_house',
    variant: 'poolPerformer1',
    where: 'reclined on pool lounger six, with the shared seven-pull dress-help interaction',
    model: MANSION_POOL_PERFORMER_1,
    from: { mansionPerformer: { post: 'poolPerformer1', index: 2 } },
    module: 'src/mansion/cast.js',
    evidence: "const secondPoolGirl = post('poolPerformer1', {",
  }),
  row({
    character: 'performer:bing_1',
    name: EXTRAS['performer:bing_1'],
    scene: 'mansion_house',
    variant: 'poolPerformer2',
    where: 'standing shoulder-deep in the swimming pool',
    model: MANSION_POOL_PERFORMER_2,
    from: { mansionPerformer: { post: 'poolPerformer2', index: 1 } },
    module: 'src/mansion/cast.js',
    evidence: "const poolGirlInWater = post('poolPerformer2', {",
  }),
  row({
    character: CHARACTER_IDS.SNOW,
    name: 'Snow',
    scene: 'mansion_house',
    where: 'the foyer with the cart, hours before anybody needs him',
    model: SNOW,
    from: { wardrobe: 'SNOW' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(SNOW, FACES.snow),',
    /* He was built WITHOUT his photograph until 2026-08-06 — owner playtest,
     * "snow doesnt have his face". `snow.png` had been on disk and in the
     * faces index the whole time; the mansion's own FACES table simply never
     * named it, so he got the authored fallback head. Same for Gratin. */
  }),
  row({
    character: CHARACTER_IDS.RIPPINFLOW,
    name: 'Rippinflow',
    scene: 'mansion_house',
    where: 'the lounge, leaning on the billiard table\'s west rail',
    model: RIPPINFLOW,
    from: { wardrobe: 'RIPPINFLOW' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(RIPPINFLOW, FACES.rippinflow),',
  }),
  row({
    character: CHARACTER_IDS.ERIC,
    name: 'Eric',
    scene: 'mansion_house',
    where: 'a chair at the dining table nobody has eaten at',
    model: ERIC,
    from: { wardrobe: 'ERIC' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(ERIC, FACES.erican),',
  }),
  row({
    character: CHARACTER_IDS.SHUBENATOR,
    name: 'The Shubenator',
    scene: 'mansion_house',
    where: 'the gallery, on his fourth lap of a landing with nothing on it',
    model: SHUBENATOR,
    from: { wardrobe: 'SHUBENATOR' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(SHUBENATOR, FACES.shubes),',
  }),
  row({
    character: CHARACTER_IDS.HOG_MAMA,
    name: 'Hog Mama',
    scene: 'mansion_house',
    where: 'a stool at the kitchen island, the one room anybody sits in',
    model: HOG_MAMA,
    from: { wardrobe: 'HOG_MAMA' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(HOG_MAMA, FACES.hogmama),',
  }),
  row({
    character: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    scene: 'mansion_house',
    where: 'the pool terrace, outside in the dark being quiet',
    model: NUMBSKULL,
    from: { wardrobe: 'NUMBSKULL' },
    module: 'src/mansion/cast.js',
    evidence: 'model: NUMBSKULL,',
  }),
  row({
    character: CHARACTER_IDS.IRISH,
    name: 'Irish',
    scene: 'mansion_house',
    where: 'the cellar corridor with a bucket, at the foot of the stairs',
    model: IRISH,
    from: { wardrobe: 'IRISH' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(IRISH, FACES.irish),',
    /* Behind the laboratory gate: this figure and the two below only exist
     * when the lab does. The ledger cannot tell you whether the lab is built
     * on a given run — see the test's "what it cannot check". */
  }),
  row({
    character: CHARACTER_IDS.BOOSKI,
    name: 'Booski',
    scene: 'mansion_house',
    where: 'the observation area beside the transfer table, running it',
    model: BOOSKI,
    from: { wardrobe: 'BOOSKI' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(BOOSKI, FACES.booski),',
  }),
  row({
    character: CHARACTER_IDS.DEATHMEGATRON,
    name: 'DeathMegatron',
    scene: 'mansion_house',
    where: 'at the laboratory glass, counting the six people behind it',
    model: DEATHMEGATRON,
    from: { wardrobe: 'DEATHMEGATRON' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(DEATHMEGATRON, FACES.deathmegatron),',
  }),
  row({
    character: CHARACTER_IDS.GRATIN,
    name: 'Gratin',
    scene: 'mansion_house',
    where: 'the interrogation area, standing over xXx with the cord',
    model: GRATIN,
    from: { wardrobe: 'GRATIN' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(GRATIN, FACES.gratin),',
  }),

  /* ================================================================== *
   * LOU'S MANSION — the siege
   *
   * Sixteen bodies, same house, same clothes. The guards are the SAME SIX
   * men as the walking tour — MANSION_GUARDS[0], [3], [4] and [5] are
   * reused by index, so the man on the vault at eight o'clock is the man
   * on the vault at midnight.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.BOOSKI,
    name: 'Booski',
    scene: 'mansion_siege',
    where: 'the conference room, on the radio',
    model: BOOSKI,
    from: { wardrobe: 'BOOSKI' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(BOOSKI, FACES.booski),',
  }),
  row({
    character: CHARACTER_IDS.RIPPINFLOW,
    name: 'Rippinflow',
    scene: 'mansion_siege',
    where: 'the upper floor with a carbine',
    model: RIPPINFLOW,
    from: { wardrobe: 'RIPPINFLOW' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(RIPPINFLOW, FACES.rippinflow),',
  }),
  row({
    character: CHARACTER_IDS.SNOW,
    name: 'Snow',
    scene: 'mansion_siege',
    where: 'still in the house, with a pistol and the same overalls',
    model: SNOW,
    from: { wardrobe: 'SNOW' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => SNOW,',
  }),
  row({
    character: CHARACTER_IDS.SHUBENATOR,
    name: 'The Shubenator',
    scene: 'mansion_siege',
    where: 'the upper floor with a carbine',
    model: SHUBENATOR,
    from: { wardrobe: 'SHUBENATOR' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(SHUBENATOR, FACES.shubes),',
  }),
  row({
    character: CHARACTER_IDS.ERIC,
    name: 'Eric',
    scene: 'mansion_siege',
    where: 'the upper floor, with the AK',
    model: ERIC,
    from: { wardrobe: 'ERIC' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(ERIC, FACES.erican),',
  }),
  row({
    character: CHARACTER_IDS.AUBBIE,
    name: 'Aubbie',
    scene: 'mansion_siege',
    where: 'down beside the wounded guard with both hands on him',
    model: AUBBIE,
    from: { wardrobe: 'AUBBIE' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => AUBBIE,',
    /* No face here even though the rest of the ensemble gets one, because
     * `aubbie.png` has not landed. The authored head is the fallback and it
     * is a legitimate look, not a placeholder. */
  }),
  row({
    character: CHARACTER_IDS.IRISH,
    name: 'Irish',
    scene: 'mansion_siege',
    where: 'the upper floor, with the AK',
    model: IRISH,
    from: { wardrobe: 'IRISH' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(IRISH, FACES.irish),',
  }),
  row({
    character: CHARACTER_IDS.DEATHMEGATRON,
    name: 'DeathMegatron',
    scene: 'mansion_siege',
    where: 'the upper floor, behind the saw',
    model: DEATHMEGATRON,
    from: { wardrobe: 'DEATHMEGATRON' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(DEATHMEGATRON, FACES.deathmegatron),',
    /* The siege has her right: the canonical model, female frame and all.
     * Compare her `bank_heist` row. */
  }),
  row({
    character: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    scene: 'mansion_siege',
    where: 'the upper floor, with the AK',
    model: NUMBSKULL,
    from: { wardrobe: 'NUMBSKULL' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => NUMBSKULL,',
  }),
  row({
    character: CHARACTER_IDS.HOG_MAMA,
    name: 'Hog Mama',
    scene: 'mansion_siege',
    where: 'the upper floor, with the revolver',
    model: HOG_MAMA,
    from: { wardrobe: 'HOG_MAMA' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(HOG_MAMA, FACES.hogmama),',
  }),
  ...[[0, 0], [1, 3], [2, 5], [3, 4]].map(([post, index]) => row({
    character: `staff:guard_${index}`,
    name: EXTRAS[`staff:guard_${index}`],
    scene: 'mansion_siege',
    where: post === 3
      ? 'on the floor being worked on — the one man in this house who can die'
      : `a defensive post, ${post + 1} of three`,
    model: MANSION_GUARDS[index],
    from: { wardrobe: `MANSION_GUARDS[${index}]` },
    module: 'src/mansion/siege/ensemble.js',
    evidence: `model: () => MANSION_GUARDS[${index}],`,
  })),

  /* ================================================================== *
   * OTHER CAMPAIGN SCENES
   * ================================================================== */

  ...[
    [CHARACTER_IDS.PROSPECT, 'Tony Squatchtana (mirror body)', 'src/squatchfather/characters/ProspectController.js', 'this.fig = new Figure({', 'the bathroom mirror only'],
    ['squatchfather:sal', EXTRAS['squatchfather:sal'], 'src/squatchfather/characters/SalController.js', 'this.fig = new Figure({', 'at the restaurant table'],
    ['squatchfather:mcclawsky', EXTRAS['squatchfather:mcclawsky'], 'src/squatchfather/characters/McClawskyController.js', 'this.fig = new Figure({', 'door, escort and table seat'],
    ['squatchfather:waiter', EXTRAS['squatchfather:waiter'], 'src/squatchfather/scenes/SquatchfatherScene.js', 'const waiterFig = makeFigure(', 'working the dining room'],
    ['squatchfather:cook', EXTRAS['squatchfather:cook'], 'src/squatchfather/scenes/SquatchfatherScene.js', 'const cook = makeBystander(', 'behind the kitchen door'],
    ['squatchfather:diner_1', EXTRAS['squatchfather:diner_1'], 'src/squatchfather/scenes/SquatchfatherScene.js', 'const diner1Fig = makeFigure(', 'seated at the west table'],
    ['squatchfather:diner_2', EXTRAS['squatchfather:diner_2'], 'src/squatchfather/scenes/SquatchfatherScene.js', 'const diner2Fig = makeFigure(', 'seated at the east table'],
  ].map(([character, name, module, evidence, where]) => row({
    character, name, scene: 'squatchfather', where, model: null, rig: 'block',
    from: { module, unshown: 'Built on Squatchfather\'s private Figure/bystander rig; translating it onto makePerson would invent a silhouette.' },
    module, evidence,
  })),

  ...[
    [CHARACTER_IDS.SNOW, 'Snow', 'snow', 'in and beside the getaway car'],
    ['motel:rico', EXTRAS['motel:rico'], 'rico', 'inside room twelve'],
    ['motel:chino', EXTRAS['motel:chino'], 'chino', 'inside room twelve'],
    ['motel:slicer', EXTRAS['motel:slicer'], 'slicer', 'the bathroom'],
    ['motel:lookout', EXTRAS['motel:lookout'], 'lookout', 'watching the motel lot'],
    ['motel:watcher', EXTRAS['motel:watcher'], 'watcher', 'watching the motel lot'],
    ['motel:clerk', EXTRAS['motel:clerk'], 'clerk', 'the motel office'],
  ].map(([character, name, preset, where]) => row({
    character, name, scene: 'jerky_motel', where, model: null, rig: 'block',
    from: { module: 'src/motel/actors.js', unshown: 'Built by the Motel private human rig; its scale and garment flags do not map honestly to makePerson.' },
    module: 'src/motel/actors.js', evidence: `  ${preset}: () => ({`,
  })),

  row({
    character: CHARACTER_IDS.PROSPECT, name: 'Tony Squatchtana (viewmodel arm)', scene: 'silver_case',
    where: 'first-person throughout the apartment; only the black jacket sleeve, white cuff and hand are rendered',
    model: null, rig: 'block',
    from: {
      module: 'src/silvercase/cast/prospect.js',
      unshown: 'The scene deliberately renders only Tony\'s authored first-person suit arm; reconstructing the unrendered full body on makePerson would misstate the production view.',
    },
    module: 'src/silvercase/cast/prospect.js',
    evidence: 'export function makeSilverCaseProspectViewArm({',
  }),
  row({
    character: CHARACTER_IDS.APE, name: 'Ape', scene: 'silver_case',
    where: 'the car, then inside the apartment', model: SILVERCASE_APE,
    from: { module: 'src/silvercase/cast/ape.js', export: 'SILVERCASE_APE_PRESENTATION', at: ['model'] },
    module: 'src/silvercase/cast/ape.js', evidence: 'export const SILVERCASE_APE_PRESENTATION = Object.freeze({',
  }),
  ...[
    ['silvercase:deke', EXTRAS['silvercase:deke'], SILVERCASE_DEKE, 'height: 1.76,', 'the couch'],
    ['silvercase:chester', EXTRAS['silvercase:chester'], SILVERCASE_CHESTER, 'height: 1.81,', 'the chair'],
    ['silvercase:winston', EXTRAS['silvercase:winston'], SILVERCASE_WINSTON, 'height: 1.71,', 'the kitchen'],
    ['silvercase:pruitt', EXTRAS['silvercase:pruitt'], SILVERCASE_PRUITT, 'height: 1.84,', 'behind the bathroom door'],
  ].map(([character, name, model, evidence, where]) => row({
    character, name, scene: 'silver_case', where, model,
    from: { module: 'src/silvercase/cast/cast.js', source: true, containing: true },
    module: 'src/silvercase/cast/cast.js', evidence,
  })),

  ...PALACE_GUARD_LOOKS.map((model, index) => row({
    character: `palace:guard_${index}`, name: EXTRAS[`palace:guard_${index}`],
    scene: 'cartel_palace', where: `guard look ${index + 1}, repeated across two patrol posts`, model,
    from: { module: 'src/cartel-palace/cast.js', source: true, adds: ['bandana'] },
    module: 'src/cartel-palace/cast.js',
    evidence: `Object.freeze({ height: ${[1.79, 1.72, 1.86, 1.75][index]},`,
  })),
  row({
    character: 'palace:mark', name: EXTRAS['palace:mark'], scene: 'cartel_palace',
    where: 'the final encounter, behind armor', model: PALACE_MARK,
    from: { module: 'src/cartel-palace/cast.js', source: true },
    module: 'src/cartel-palace/cast.js', evidence: 'const MARK_LOOK = Object.freeze({',
  }),
  row({
    character: CHARACTER_IDS.SAUCE, name: 'Sauce', scene: 'cartel_palace',
    where: 'the final encounter as the traitor', model: SAUCE,
    from: { wardrobe: 'SAUCE' }, module: 'src/cartel-palace/cast.js', evidence: 'model: SAUCE,',
  }),

  /* ================================================================== *
   * THE BLOCK-RIG SCENES
   *
   * Both of these build people with `makeFigure` from src/beefrun/npc.js
   * rather than the club's `makePerson`. Sasole's Beef Run row is above,
   * beside his other three; these are the rest.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.OLD_STOVE,
    name: 'Old Stove',
    scene: 'beef_run',
    where: 'Whispering Pines, beside the aeroplane in a parachute rig',
    model: null,
    from: {
      module: 'src/beefrun/npc.js',
      unshown: 'Built from the reference photographs straight onto the block '
        + 'rig — wayfarers, a red parachute rig and a green headset, none of '
        + 'which the club figure has. There is no wardrobe record to show and '
        + 'inventing one would be restating him.',
    },
    module: 'src/beefrun/npc.js',
    evidence: 'export function makeOldStove()',
    rig: 'block',
    /* He IS on the Bing floor as well, in a completely different outfit, and
     * that is correct: `old_stove` at the club is a man in a booth with a
     * drink, and this is the same man at work for an employer he does not
     * discuss. Two looks, one deliberate. */
  }),
  row({
    character: CHARACTER_IDS.IRISH,
    name: 'Irish',
    scene: 'enola_squatch',
    where: 'the navigator\'s seat, with the board',
    model: null,
    from: { module: 'src/enolasquatch/crew.js', unshown: 'Inline on the block rig.' },
    module: 'src/enolasquatch/crew.js',
    evidence: 'name: \'irish\',',
    rig: 'block',
    divergenceStatus: 'intentional',
    divergence: 'Intentional scene variant: Irish wears blue navigator flight '
      + 'kit and carries the chart while serving as Enola aircrew; his '
      + 'canonical green shirt remains his non-flight outfit.',
  }),
  row({
    character: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    scene: 'enola_squatch',
    where: 'under the open bomb bay, then aboard — he did the bolts',
    model: null,
    from: { module: 'src/enolasquatch/crew.js', unshown: 'Inline on the block rig.' },
    module: 'src/enolasquatch/crew.js',
    evidence: 'name: \'numbskull\',',
    rig: 'block',
    divergenceStatus: 'intentional',
    divergence: 'Intentional scene variant: Numbskull wears grease-marked '
      + 'coveralls and a cap for his mechanic and bomb-bay job; his canonical '
      + 'casual outfit remains the non-flight look.',
  }),
  row({
    character: CHARACTER_IDS.SHUBENATOR,
    name: 'The Shubenator',
    scene: 'enola_squatch',
    where: 'the rear gun, in a flying helmet he found',
    model: null,
    from: { module: 'src/enolasquatch/crew.js', unshown: 'Inline on the block rig.' },
    module: 'src/enolasquatch/crew.js',
    evidence: 'name: \'shubes\',',
    rig: 'block',
  }),
]);

/* ====================================================================== *
 * READING IT
 * ====================================================================== */

/** Everybody in a scene, in ledger order. */
export function appearancesInScene(sceneId) {
  return APPEARANCES.filter((a) => a.scene === sceneId);
}

/** One person, everywhere they turn up, in ledger order. */
export function appearancesOf(characterId) {
  return APPEARANCES.filter((a) => a.character === characterId);
}

/**
 * Everybody the ledger knows about, in the order the player meets them —
 * which is ledger order, because the rows are written in campaign order.
 */
export function ledgerCharacters() {
  const seen = new Map();
  for (const a of APPEARANCES) {
    if (!seen.has(a.character)) {
      seen.set(a.character, { id: a.character, name: a.name, scenes: [] });
    }
    seen.get(a.character).scenes.push(a.scene);
  }
  return [...seen.values()];
}

/** Every scene, in SCENES order, with a head count. */
export function ledgerScenes() {
  return Object.values(SCENES).map((scene) => ({
    ...scene,
    cast: appearancesInScene(scene.id),
  }));
}

/**
 * Whether the fitting room can put this row on the stand.
 *
 * A row with no model is not a gap in the ledger — it is a scene that builds
 * its people on a rig this room does not own, recorded so that the person is
 * visibly IN that scene even though there is nothing to draw.
 */
export const isShowable = (appearance) => Boolean(appearance.model);
