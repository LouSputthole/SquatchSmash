/**
 * Who you can sit down as at the Dead Giveaway table.
 *
 * Every photograph in `assets/faces/index.json`, plus Tony. Selectable by
 * anybody, duplicates allowed: two players can both be Big Uncle Lou, and the
 * table does not pretend that is strange.
 *
 * Nothing about a body is typed here that already has a home:
 *   - the named cast wears its canonical model from `src/core/wardrobe.js`;
 *   - the Family members the wardrobe does not carry (Seff, Old Stove, Lag,
 *     Ape) wear the models the Bing already seats them in
 *     (`src/bing/family.js` FAMILY), matched by photo filename;
 *   - Tony is `src/core/prospect-body.js`'s canonical prospect outfit.
 * The one body with neither is the Silver Room's waiter, whose model lives
 * inline in `src/silver/cast.js`; it is restated below and says so.
 *
 * `face` is the PNG path every seat builds the photo-skull with (see
 * `src/bing/cast.js` makePerson, and face-video.js which replaces material 4
 * of that skull with a camera feed). Tony has no photograph on disk, so his
 * `face` is null and `seats.js` gives his head the neutral photo-skull only
 * when a camera feed needs somewhere to land.
 */
import { WARDROBE } from '../core/wardrobe.js';
import { PROSPECT_OUTFITS } from '../core/prospect-body.js';
import { DEFAULT_PLAYER_OUTFIT } from '../core/first-person-body.js';
import { FAMILY } from '../bing/family.js';

const FACE_DIR = 'assets/faces/';

/** The Bing's seated Family, by the photo each one wears. */
const FAMILY_BY_PHOTO = new Map(FAMILY.map((member) => [member.photo, member]));

/* The Silver Room's head waiter, restated from src/silver/cast.js (his model
 * is an inline option bag on an Npc there, not an export). Keep the two in
 * step if he is ever redressed. */
const SILVER_WAITER = Object.freeze({
  height: 1.78, dress: 'waistcoat', shirt: 0xf2eee6, hair: 'crop',
  hairColour: 0x14100e, skin: 0xd4a078,
  waistcoatColour: 0xc85a17,
  bowtie: true, bowtieColour: 0xb71926,
});

function familyModel(photo) {
  return FAMILY_BY_PHOTO.get(photo)?.model ?? null;
}

/**
 * [id, display name, photo filename or null, model]
 *
 * Order is the order of the lobby grid: the founders first, then the room.
 */
const ENTRIES = [
  ['lou', 'Big Uncle Lou', 'lou.png', WARDROBE.lou],
  ['booski', 'Booskibro', 'booski.png', WARDROBE.booski],
  ['sasole', 'Captain Lou Sasole', 'sasole.png', WARDROBE.captain_lou_sasole],
  ['deathmegatron', 'DeathMegatron', 'deathmegatron.png', WARDROBE.deathmegatron],
  ['rippinflow', 'Rippinflow', 'rippinflow.png', WARDROBE.rippinflow],
  ['numbskull', 'Numbskull', 'numbskull.png', WARDROBE.numbskull],
  ['seff', 'Seff', 'seff.png', familyModel('seff.png')],
  ['lag', 'Lag', 'lag.png', familyModel('lag.png')],
  ['ape', 'Ape', 'ape.png', familyModel('ape.png')],
  ['irish', 'Irish', 'irish.png', WARDROBE.irish],
  ['gratin', 'Gratin', 'gratin.png', WARDROBE.gratin],
  ['eric', 'Eric', 'erican.png', WARDROBE.eric],
  ['snow', 'Snow', 'snow.png', WARDROBE.snow],
  ['stove', 'Old Stove', 'stove.png', familyModel('stove.png')],
  ['hogmama', 'Hog Mama', 'hogmama.png', WARDROBE.hogmama],
  ['shubenator', 'The Shubenator', 'shubenator.png', WARDROBE.shubenator],
  ['shubes', 'Shubes', 'shubes.png', WARDROBE.shubenator],
  ['aubbie', 'Aubbie', 'aubbie.png', WARDROBE.aubbie],
  ['sauce', 'Sauce', 'sauce.png', WARDROBE.sauce],
  ['kittenboss', 'Kittenboss', 'kittenboss.png', WARDROBE.kittenboss],
  ['waiter', 'The Silver Room Waiter', 'silver-waiter.png', SILVER_WAITER],
  ['tony', 'Tony Squatchtana', null, PROSPECT_OUTFITS[DEFAULT_PLAYER_OUTFIT]],
];

/** A plain, seated-friendly fallback for anybody whose model is missing. */
const FALLBACK_MODEL = Object.freeze({ height: 1.78, build: 1.05, dress: 'suit', shirt: 0x24242c, hair: 'short' });

export const ROSTER = Object.freeze(ENTRIES.map(([id, name, photo, model]) => Object.freeze({
  id,
  name,
  photo,
  face: photo ? `${FACE_DIR}${photo}` : null,
  /* Copied, never shared: makePerson reads but a scene that spreads a frozen
   * wardrobe entry and adds a face must not be able to write back into it. */
  model: Object.freeze({ ...(model ?? FALLBACK_MODEL) }),
})));

const BY_ID = new Map(ROSTER.map((entry) => [entry.id, entry]));

/** The roster entry for an id; unknown ids fall back to Tony so a seat never renders empty. */
export function characterById(id) {
  return BY_ID.get(id) ?? BY_ID.get('tony');
}

/** True when `id` names somebody on the roster (the lobby validates before sending). */
export function isRosterId(id) {
  return BY_ID.has(id);
}

/** The id a fresh visitor is offered first. */
export const DEFAULT_CHARACTER = 'lou';
