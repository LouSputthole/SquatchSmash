/**
 * WHO IS IN WHAT, AND WHAT THEY HAVE ON WHEN THEY ARE IN IT.
 *
 * `src/core/wardrobe.js` answers "what does Big Uncle Lou wear". It cannot
 * answer "what is Big Uncle Lou wearing at the Bing", because that is not its
 * decision: the club spreads `BIG_UNCLE_LOU_BING`, the mansion spreads
 * `BIG_UNCLE_LOU_MANSION`, the boat spreads plain `BIG_UNCLE_LOU`, and the golf
 * course types its own table out entirely. One man, four outfits, four files,
 * and until this ledger existed there was nowhere to see the four of them next
 * to each other.
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
 * AND WIRED TO AN ALARM.** Four scenes dress people from tables of their own —
 * golf's private `WARDROBE`, the heist's `HEIST_CREW_PRESENTATION`, the Bing's
 * three regulars, the graveyard's Snow, the Enola's crew. This file cannot
 * import most of those (see rule 4) and it will not pretend they do not exist,
 * so it carries a copy, and every copy is checked field by field against the
 * real scene by `tests/appearances.test.mjs`. A hand-written copy with no test
 * on it is a document; with a test on it, it is a mirror that shouts. **Never
 * edit a `from.source` model here to "fix" a scene — the alarm is telling you
 * the scene changed, and the scene is right.**
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
 * IN: everybody with a campaign identity (`CHARACTER_IDS`), plus the four
 * uniformed people who have no id but are the same body in more than one
 * scene — Lou's door man, his six guards and the Bada Bing's bartender, who
 * works Lou's house as well as the club.
 *
 * OUT: the room. A club is full of dancers, drinkers, waiters and a dealer; a
 * restaurant is full of diners; a bank is full of customers. They are built
 * from inline literals at their call sites, most of them randomised, none of
 * them the same person twice, and listing them here would bury the fourteen
 * people the owner is actually reviewing under two hundred he is not. Also out:
 * the two dressed bodies in the siege's aftermath (`src/mansion/siege/
 * dressing.js`) — the dead performer has no name yet on purpose, and that
 * decision is `docs/OPEN-DECISIONS.md` §4's, not this file's.
 *
 * ## What this ledger says that nothing else in the repo says
 *
 * Read the `divergence` fields. They are the reason the ledger was worth
 * writing: five scenes dress somebody in a way that disagrees with the
 * campaign's own wardrobe, and every one of them was invisible until the rows
 * were put side by side. They are REPORTED here and in `docs/FUTURE-EDITS.md`.
 * Nothing in this pass restyles anybody.
 */

import { CHARACTER_IDS } from './campaign.js';
import { BILLY_HOTDOG_MODEL } from './hotdog-model.js';
import { APE_FAMILY_MEMBER } from '../bing/family-ape.js';
import {
  AUBBIE, BADA_BING_BARTENDER, BIG_UNCLE_LOU, BIG_UNCLE_LOU_BING,
  BIG_UNCLE_LOU_MANSION, BOOSKI, CAPTAIN_LOU_SASOLE, DEATHMEGATRON, ERIC,
  GRATIN, HOG_MAMA, IRISH, MANSION_DOOR_MAN, MANSION_GUARDS, NUMBSKULL,
  RIPPINFLOW, SAUCE, SHUBENATOR, SNOW, WILLY,
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
  bada_bing: Object.freeze({
    id: 'bada_bing',
    label: 'The Bada Bing — an ordinary night',
    short: 'Bing',
    rig: 'bing',
    modules: Object.freeze(['src/bing/family.js', 'src/bing/cast.js']),
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
  golf: Object.freeze({
    id: 'golf',
    label: 'Golf — Thursday morning',
    short: 'Golf',
    rig: 'day',
    modules: Object.freeze(['src/golf/cast.js']),
    note: 'The one scene that dresses four of the cast out of a table of its '
      + 'own rather than out of core/wardrobe.js. See the divergence note on '
      + 'Lou: this is his third canonical look and it does not live with the '
      + 'other two.',
  }),
  silver_room: Object.freeze({
    id: 'silver_room',
    label: 'The Silver Room',
    short: 'Silver Room',
    rig: 'bing',
    modules: Object.freeze(['src/silver/cast.js']),
    note: 'Candlelight over white linen, so `bing` again as the nearest warm '
      + 'rig. Only Ape is a named member of the cast in this room; everybody '
      + 'else is staff and diners.',
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
  mansion_house: Object.freeze({
    id: 'mansion_house',
    label: "Lou's mansion — the house",
    short: 'Mansion',
    rig: 'bing',
    modules: Object.freeze([
      'src/mansion/cast.js', 'src/mansion/scenes/MansionInterior.js',
    ]),
    note: 'The walking tour and PROJECT SILENT SQUATCH. Willy and Billy '
      + 'HotDog are dead before this arc and are correctly absent. TWO Big '
      + 'Uncle Lous are built in this house — see his two rows.',
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
});

/* ====================================================================== *
 * THE PEOPLE WITH NO CAMPAIGN ID
 *
 * Everybody else in this ledger is a `CHARACTER_IDS` value. These eight are
 * not — they have no lines the campaign owns, no voice profile and no save
 * flag — but they are the same body in more than one scene, which is the
 * whole reason a ledger exists, so they are in it under ids of their own.
 * The prefix is deliberate: nothing here can ever be mistaken for a campaign
 * id by a reader or by a `CHARACTER_IDS[...]` lookup.
 * ====================================================================== */

export const EXTRAS = Object.freeze({
  'staff:bartender': 'The Bada Bing\'s bartender',
  'staff:door_man': "The man on Lou's door",
  'staff:guard_0': "Lou's security — 1.86, short dark hair",
  'staff:guard_1': "Lou's security — 1.78, cropped",
  'staff:guard_2': "Lou's security — 1.90, bearded",
  'staff:guard_3': "Lou's security — 1.81, bald",
  'staff:guard_4': "Lou's security — 1.75, the heavy one",
  'staff:guard_5': "Lou's security — 1.88, cropped and bearded",
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

/* ---- src/golf/cast.js's private `WARDROBE` ---------------------------
 *
 * Four men in full traditional golf dress. This is the one clothing table in
 * the game that a scene keeps to itself: `const WARDROBE = {…}` in
 * `src/golf/cast.js` is not exported, so nothing outside that module can read
 * it and there is no way to import it here. Copied, and alarmed.
 *
 * `docs/DRESSING-THE-CAST.md` states that "Lou's three looks — the club, the
 * mansion and the course — are outfits on one man, and they live in
 * `src/core/wardrobe.js` beside him rather than being typed out in each
 * scene." Two of the three do. This is the third and it does not. That is a
 * row in docs/FUTURE-EDITS.md, not a change this pass makes. */
const GOLF_LOU = Object.freeze({
  height: 1.80, build: 1.12, dress: 'argyle', hair: 'receding',
  shirt: 0x1f5138, shirtAccent: 0xf2efe2,
  argyle: Object.freeze({ a: 0xf2efe2, b: 0xe0c46a, line: 0x0b2a1c }),
  knickers: true, trouserColour: 0x7a7452, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x5e5a3e,
  chain: 'gold', chainStyle: 'single', pendant: true, pendantStyle: 'horn',
  watch: 'gold', bracelet: 'gold',
  skin: 0xd7a67e, hairColour: 0x17110d,
  bandana: false,
});
const GOLF_RIPPINFLOW = Object.freeze({
  height: 1.83, build: 1.05, dress: 'argyle', hair: 'crop',
  shirt: 0x7b3f95, shirtAccent: 0xf4f1e8,
  argyle: Object.freeze({ a: 0xf4f1e8, b: 0xf0b83c, line: 0x37134f }),
  knickers: true, trouserColour: 0x8a7f9c, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x6a4f80,
  chain: 'silver', pendant: false, watch: 'silver',
  bandana: false,
});
const GOLF_ERIC = Object.freeze({
  height: 1.76, build: 0.98, dress: 'argyle', hair: 'short',
  shirt: 0x39465c, shirtAccent: 0xeceef2,
  argyle: Object.freeze({ a: 0xc9d3df, b: 0x8fa2bb, line: 0x161d2a }),
  knickers: true, trouserColour: 0x5c6472, shoeStyle: 'saddle',
  hat: 'flatcap', hatColour: 0x424b5a,
  watch: 'silver',
  bandana: false,
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
 * This one IS exported, so the test imports it and deep-compares rather than
 * reading text — a strictly better check than the golf one gets. It is copied
 * here only because of rule 4: importing `src/heist/cast.js` would pull three,
 * the heist figure rig and the weapon models into a data file.
 *
 * What the scene builds is `{...presentation.model, shirt: presentation.shirt,
 * skin: 0xd2a074, bandana: false}` plus the photo, so that composite is what
 * is recorded — the crew's `model` alone is not what anybody sees. */
const HEIST_SNOW = Object.freeze({
  height: 1.79, build: 1.08, dress: 'work', hair: 'crop',
  shirt: 0x313740, skin: 0xd2a074, bandana: false,
});
const HEIST_RIPPINFLOW = Object.freeze({
  height: 1.77, build: 1.02, dress: 'work', hair: 'tied',
  shirt: 0x3d4039, skin: 0xd2a074, bandana: false,
});
const HEIST_SHUBENATOR = Object.freeze({
  height: 1.81, build: 1.05, dress: 'work', hair: 'short',
  shirt: 0x2d3440, skin: 0xd2a074, bandana: false,
});
const HEIST_DEATHMEGATRON = Object.freeze({
  height: 1.88, build: 1.3, dress: 'work', hair: 'bald', beard: true,
  shirt: 0x38332f, skin: 0xd2a074, bandana: false,
});
const HEIST_NUMBSKULL = Object.freeze({
  height: 1.72, build: 1.0, dress: 'work', hair: 'receding',
  hairColour: 0x3a2a1e, glasses: true,
  shirt: 0x3f4247, skin: 0xd2a074, bandana: false,
});

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

/* ---- the graveyard's Snow --------------------------------------------
 *
 * Typed inline in `src/graveyard/world.js` and it is NOT the canonical Snow.
 * Kept verbatim so the difference is visible in the fitting room rather than
 * argued about; the difference itself is recorded on the row below. */
const GRAVEYARD_SNOW = Object.freeze({
  height: 1.7, build: 0.95, dress: 'work', shirt: 0x303a44,
  hairColour: 0x9a9a9a, skin: 0xf0cba6,
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
 *   divergence  optional. Something this row disagrees with, reported and
 *               NOT fixed here.
 * ====================================================================== */

/** Freeze a row and fill in the parts that are the same on nearly all of them. */
const row = (o) => Object.freeze({ rig: 'person', divergence: null, ...o });

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
    model: BIG_UNCLE_LOU,
    from: { wardrobe: 'BIG_UNCLE_LOU' },
    module: 'src/bing/hotdog-party.js',
    evidence: 'model: { ...BIG_UNCLE_LOU, face: faces.has(\'lou.png\')',
    /* The plain suit, NOT the club's three-piece — he is running a private
     * party in his own building rather than holding court in the office. */
    divergence: 'He is in his own club and wearing the plain BIG_UNCLE_LOU '
      + 'rather than BIG_UNCLE_LOU_BING, which is the outfit written FOR this '
      + 'building. Possibly intentional (a party is not office hours), '
      + 'possibly the party predates the variant. Worth a decision.',
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
    from: { module: 'src/golf/cast.js', source: true },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.LOU]: {',
    divergence: 'His third look is typed out in the scene, not in '
      + 'src/core/wardrobe.js beside the other two — which is the exact thing '
      + 'docs/DRESSING-THE-CAST.md claims is not true. It also gives him a '
      + 'different HEIGHT (1.80 against the canonical 1.83) and BUILD (1.12 '
      + 'against 1.38), so the man on the course is measurably a smaller man '
      + 'than the man in the club. The jewellery is right and is his.',
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
   * survivor is the one the mission talks to. `BIG_UNCLE_LOU_MANSION` is now
   * unused by any scene and is kept in `wardrobe.js` on purpose: it is the
   * right outfit for him at home, and whoever seats him in `cast.js` should
   * reach for it. See `docs/FUTURE-EDITS.md`.
   */
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'mansion_house',
    where: 'his office, standing behind the desk, facing the door',
    model: BIG_UNCLE_LOU,
    from: { wardrobe: 'BIG_UNCLE_LOU' },
    module: 'src/mansion/cast.js',
    evidence: 'model: withFace(BIG_UNCLE_LOU, FACES.lou),',
    divergence: 'He is in the WORKING suit at home, because he is the Lou that '
      + 'survived the duplicate above and that one was always the suit. '
      + 'BIG_UNCLE_LOU_MANSION — open camp shirt, the corno on show, no hat, no '
      + 'chalk stripe — is the better read for a man in his own house at night '
      + 'and is now worn by nobody. Reported, not fixed: seating him and '
      + 'dressing him is a scene decision.',
  }),
  row({
    character: CHARACTER_IDS.LOU,
    name: 'Big Uncle Lou',
    scene: 'mansion_siege',
    where: 'the desk end of his own office, on the telephone',
    model: BIG_UNCLE_LOU,
    from: { wardrobe: 'BIG_UNCLE_LOU' },
    module: 'src/mansion/siege/ensemble.js',
    evidence: 'model: () => withFace(BIG_UNCLE_LOU, FACES.lou),',
    divergence: 'The siege is the same night as the house, in the same '
      + 'building, and it puts him back in the suit rather than in '
      + 'BIG_UNCLE_LOU_MANSION. Whichever way the two-Lous question above is '
      + 'answered, this row should match it.',
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
    model: null,
    from: {
      module: 'src/enolasquatch/crew.js',
      unshown: 'Typed out inline on the block rig, in that rig\'s own option '
        + 'names (`jacket`, `trousers`, `boots` as flat colours, `build` on a '
        + '0..1 scale). None of it is makePerson vocabulary, and translating '
        + 'it would be inventing an outfit rather than reading one.',
    },
    module: 'src/enolasquatch/crew.js',
    evidence: 'name: \'captain_lou_sasole\',',
    rig: 'block',
    divergence: 'HE IS IN THE WRONG JACKET. The Enola gives him '
      + '`jacket: 0x5a3a22` — "the same old leather flight jacket" — and the '
      + 'canonical record says sage green `0x39544e`, chosen deliberately so '
      + 'that "when both Lous are in the same room nobody has to read a '
      + 'subtitle to tell them apart". src/beefrun/npc.js records that this '
      + 'exact brown-leather-over-khaki literal was the drift the wardrobe was '
      + 'written to end — and it is still live one module over. Nothing else '
      + 'in the game dresses a wardrobe character against the wardrobe this '
      + 'directly.',
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
    model: GRAVEYARD_SNOW,
    from: { module: 'src/graveyard/world.js', source: true },
    module: 'src/graveyard/world.js',
    evidence: 'name: \'Snow\', tier: \'hero\'',
    divergence: 'This is not the canonical SNOW. It is the same height, build, '
      + 'hair and skin typed out again with a DIFFERENT SHIRT (0x303a44 '
      + 'against 0x3a4048) and NO BELT. The wardrobe\'s entire argument about '
      + 'this man is "He gets a belt and boots and nothing else, and that is '
      + 'the point" — so the one garment he owns is the one the graveyard '
      + 'drops. Spreading SNOW would fix it in one line; that is a graveyard '
      + 'edit, not this pass\'s.',
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
    from: { module: 'src/golf/cast.js', source: true },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.RIPPINFLOW]: {',
    /* The thin silver line and nothing hanging off it, exactly as everywhere
     * else — the one thing this table does carry over from the wardrobe. */
  }),
  row({
    character: CHARACTER_IDS.ERIC,
    name: 'Eric',
    scene: 'golf',
    where: 'the tee, third of the foursome',
    model: GOLF_ERIC,
    from: { module: 'src/golf/cast.js', source: true },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.ERIC]: {',
  }),
  row({
    character: CHARACTER_IDS.PROSPECT,
    name: 'Tony Squatchtana (the Prospect)',
    scene: 'golf',
    where: 'the tee, in whatever the pro shop had',
    model: GOLF_PROSPECT,
    from: { module: 'src/golf/cast.js', source: true },
    module: 'src/golf/cast.js',
    evidence: '[CHARACTER_IDS.PROSPECT]: {',
    /* THE ONLY PLACE IN THE LEDGER THE PLAYER HAS A BODY. Everywhere else he
     * is a first-person camera with a pair of hands, so there is nothing to
     * put on a stand. */
  }),

  /* ================================================================== *
   * THE SILVER ROOM
   * ================================================================== */

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
   * Work clothes and plate carriers, which is right for the scene. What is
   * not obviously right is that the table re-decides five people's bodies
   * as well as their clothes; those are on the rows.
   * ================================================================== */

  row({
    character: CHARACTER_IDS.SNOW,
    name: 'Snow',
    scene: 'bank_heist',
    where: 'the safehouse, west of the table — he leads this one',
    model: HEIST_SNOW,
    from: { module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', adds: ['shirt', 'skin', 'bandana'], at: [CHARACTER_IDS.SNOW, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.SNOW]: Object.freeze({',
    divergence: 'Canonically 1.70 and build 0.95. On this job he is 1.79 and '
      + '1.08 — the janitor is nine centimetres taller and visibly heavier '
      + 'than he is in every other scene.',
  }),
  row({
    character: CHARACTER_IDS.RIPPINFLOW,
    name: 'Rippinflow',
    scene: 'bank_heist',
    where: 'the safehouse, on the driver\'s side',
    model: HEIST_RIPPINFLOW,
    from: { module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', adds: ['shirt', 'skin', 'bandana'], at: [CHARACTER_IDS.RIPPINFLOW, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.RIPPINFLOW]: Object.freeze({',
    /* The one crew member whose height and build survive the trip: 1.77 and
     * 1.02 against a canonical 1.77 and 1.00. */
  }),
  row({
    character: CHARACTER_IDS.SHUBENATOR,
    name: 'The Shubenator',
    scene: 'bank_heist',
    where: 'the safehouse, centre — the technical',
    model: HEIST_SHUBENATOR,
    from: { module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', adds: ['shirt', 'skin', 'bandana'], at: [CHARACTER_IDS.SHUBENATOR, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.SHUBENATOR]: Object.freeze({',
    divergence: 'Canonically 1.84 and build 1.35 — "the frame that comes '
      + 'through a door before he does". Here he is 1.81 and 1.05, which is '
      + 'an ordinary man.',
  }),
  row({
    character: CHARACTER_IDS.DEATHMEGATRON,
    name: 'DeathMegatron',
    scene: 'bank_heist',
    where: 'the safehouse, east — the heavy, with the carbine',
    model: HEIST_DEATHMEGATRON,
    from: { module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', adds: ['shirt', 'skin', 'bandana'], at: [CHARACTER_IDS.DEATHMEGATRON, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.DEATHMEGATRON]: Object.freeze({',
    divergence: 'SHE IS BUILT AS A BALD BEARDED MAN. The campaign\'s '
      + 'DeathMegatron is one of the FIVE, 1.79, `gender: female`, '
      + '`bodyShape: curvy`, hair tied. This crew row is 1.88, build 1.30, '
      + '`hair: bald`, `beard: true`, and its own comment calls her "the big '
      + 'one". Whatever the right answer is, it is not that the same person '
      + 'has a beard in one scene. The heist predates the pass that gave her '
      + 'the female frame, which is almost certainly the whole explanation.',
  }),
  row({
    character: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    scene: 'bank_heist',
    where: 'the safehouse, far east — on control',
    model: HEIST_NUMBSKULL,
    from: { module: 'src/heist/cast.js', export: 'HEIST_CREW_PRESENTATION', adds: ['shirt', 'skin', 'bandana'], at: [CHARACTER_IDS.NUMBSKULL, 'model'] },
    module: 'src/heist/cast.js',
    evidence: '[CHARACTER_IDS.NUMBSKULL]: Object.freeze({',
    divergence: 'Canonically 1.95 and build 1.45 — "Tallest and heaviest on '
      + 'the roster... takes up a doorway". Here he is 1.72 and 1.00, and the '
      + 'file\'s own comment calls him "the shortest man in the van". Those '
      + 'two sentences are about the same person and they cannot both stand.',
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
    divergence: 'Blue flight kit (`shirt: 0x6a8ba8`) against a canonical green '
      + 'shirt. Defensible as aircrew clothing rather than as drift, but it is '
      + 'a decision nobody wrote down.',
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
    divergence: 'Grease-shiny coveralls and a cap. Same note as Irish: it is '
      + 'a job, not a wardrobe, and it is undocumented.',
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
