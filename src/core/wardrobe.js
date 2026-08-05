/**
 * What the Family actually wears.
 *
 * Until this file existed, a character's clothes were written out again in
 * every scene that needed them, and they drifted. Big Uncle Lou was 1.83m and
 * build 1.38 in a suit at the closed party, and 1.80m and build 1.40 in a
 * shirt on the boat — a different man in a different outfit, twice, because
 * two people typed him on two different days. `src/core/hotdog-model.js`
 * already solved this for Billy for exactly the same reason: the body in the
 * trunk has to be visibly the man you watched go down.
 *
 * So: one canonical model per person. A scene spreads it and adds what is
 * local to that scene — a face path, a `folded` pose, a spot — and never
 * restates a height, a build or a garment.
 *
 * ## Wardrobe is characterisation, not decoration
 *
 * These people say things about themselves with their clothes, and the options
 * are chosen to say them:
 *
 * - **Lou** is the only man on the roster wearing every expensive thing at
 *   once: pressed suit, gold buckle, gold watch, gold rope, pocket square.
 *   None of it is subtle and none of it is meant to be. The corno on the end
 *   of the rope is his and nobody else's — Booski and DeathMegatron wear the
 *   crest, which is the Family's, and Lou wears the thing his grandmother gave
 *   him. It goes with him into every scene he is in.
 * - **Booski** is old money by comparison — the same gold, but on a knit
 *   rather than a suit, and the chain is layered rather than loud.
 * - **Captain Lou Sasole** is a working pilot, so the good thing he owns is
 *   the jacket, and everything else is serviceable.
 * - **Snow** cleans up after people. He gets a belt and boots and nothing
 *   else, and that is the point.
 * - **Rippinflow** wears one thin silver line and nothing hanging off it,
 *   which is a different man saying a different thing with his neck.
 *
 * ## `trim` is not free
 *
 * Collars, plackets, buttons, cuffs, creases and turn-ups are perhaps thirty
 * extra meshes on a figure. They go to people the player stands in front of
 * and talks to. The room behind them does not need buttons, and a scene that
 * wants a crowd should keep spreading the plain models.
 */

/* The two Lous are different men and must never merge: `lou`/`lou1` is Big
 * Uncle Lou Sputthole, `captain_lou_sasole`/`lou2` is the pilot. They are
 * deliberately adjacent in this file so that the difference is visible to
 * anybody editing either of them. */

export const BIG_UNCLE_LOU = Object.freeze({
  height: 1.83,
  build: 1.38,
  gut: 0.42,
  dress: 'suit',
  shirt: 0x2f3038,
  shirtAccent: 0xe8e2d2,
  jacketColour: 0x2f3038,
  hairColour: 0x17110d,
  skin: 0xd7a67e,
  luxury: true,
  trim: true,
  belt: 'gold',
  trouserFit: 'creased',
  watch: 'gold',
  chain: 'gold',
  chainStyle: 'layered',
  pendant: true,
  pendantStyle: 'horn',
});

/**
 * The Bing, where he is the man who owns the building.
 *
 * The owner's reference is a chalk-stripe three-piece with the jacket open on
 * the waistcoat, a dark tie, and a hat — so that is what this is, plus the
 * corno out over the waistcoat where it can be seen. The jacket has to be OPEN
 * for that last part to be true at all: a chain worn over a buttoned jacket is
 * a chain nobody in the club will ever look at.
 */
export const BIG_UNCLE_LOU_BING = Object.freeze({
  ...BIG_UNCLE_LOU,
  pinstripe: true,
  threePiece: true,
  hat: 'fedora',
  hatColour: 0x4a3c2c,
});

/**
 * The mansion, where he is at home and not working.
 *
 * Open short-sleeve camp shirt over a white tee, slacks, the corno on show
 * because there is no jacket in the way of it, the watch on one wrist and a
 * gold bracelet on the other. Same man, same jewellery, none of the armour —
 * which is the point of dressing him differently here at all.
 */
export const BIG_UNCLE_LOU_MANSION = Object.freeze({
  ...BIG_UNCLE_LOU,
  dress: 'camp',
  shirt: 0x191a20,
  shirtAccent: 0xd8cbb2,
  trouserColour: 0x2b2c34,
  pattern: true,
  hair: 'receding',
  bracelet: 'gold',
  belt: 'leather',
  luxury: false,
  trim: false,
  /* No hat and no chalk stripe indoors. `trim` off as well: its shirt cuff and
   * cufflink belong to a long sleeve, and this shirt has not got one. */
  hat: false,
  pinstripe: false,
  threePiece: false,
});

export const CAPTAIN_LOU_SASOLE = Object.freeze({
  height: 1.80,
  build: 1.10,
  dress: 'bomber',
  shirt: 0x2e3a5e,
  /* Flight-jacket sage rather than the club's blues, so that when both Lous
   * are in the same room nobody has to read a subtitle to tell them apart. */
  jacketColour: 0x39544e,
  patches: true,
  hairColour: 0x4a4a48,
  skin: 0xd2a074,
  trim: true,
  belt: 'leather',
  trouserFit: 'creased',
  watch: 'silver',
});

export const BOOSKI = Object.freeze({
  height: 1.80,
  build: 1.20,
  dress: 'shirt',
  shirt: 0x20365f,
  shirtAccent: 0x405a86,
  hairColour: 0x2a1c14,
  skin: 0xd9a97f,
  neckline: 'v',
  luxury: true,
  belt: 'gold',
  trouserFit: 'creased',
  watch: 'gold',
  chain: 'gold',
  chainStyle: 'layered',
  pendant: true,
  pendantStyle: 'crest',
});

export const DEATHMEGATRON = Object.freeze({
  height: 1.79,
  build: 1.12,
  gender: 'female',
  bodyShape: 'curvy',
  dress: 'suit',
  shirt: 0x1a1d2a,
  shirtAccent: 0xc7a66a,
  hair: 'tied',
  hairColour: 0x14100e,
  skin: 0xc08a5e,
  luxury: true,
  trim: true,
  belt: 'gold',
  trouserFit: 'creased',
  watch: 'gold',
  chain: 'gold',
  chainStyle: 'layered',
  pendant: true,
  pendantStyle: 'crest',
});

export const SNOW = Object.freeze({
  height: 1.70,
  build: 0.95,
  dress: 'work',
  shirt: 0x3a4048,
  hairColour: 0x9a9a9a,
  skin: 0xf0cba6,
  belt: 'leather',
});

/* Ape's figure is canon and is NOT restated here -- `src/bing/family-ape.js`
 * owns it, because the scenes that need him also need his knife, his routes
 * and his signature takes, and splitting the man across two files is how a
 * character starts drifting in the first place. What he gains from this pass
 * is a belt, spread onto that model at its source. */

export const SHUBENATOR = Object.freeze({
  height: 1.84,
  build: 1.35,
  dress: 'tee',
  shirt: 0x2e6ed9,
  hairColour: 0x2a1c14,
  skin: 0xe8c39c,
  belt: 'leather',
});

export const RIPPINFLOW = Object.freeze({
  height: 1.77,
  build: 1.00,
  dress: 'tee',
  shirt: 0x2e2438,
  hairColour: 0x14100e,
  skin: 0x8d5a3a,
  /* A thin silver line, nothing hanging off it. The gold rope with the
   * medallion is Lou's whole argument about himself; Rippinflow is not making
   * that argument. */
  chain: 'silver',
  pendant: false,
  belt: 'leather',
  watch: 'silver',
});

export const NUMBSKULL = Object.freeze({
  height: 1.95,
  build: 1.45,
  dress: 'tee',
  shirt: 0x3a3a42,
  hair: 'bald',
  skin: 0xd9a97f,
  belt: 'leather',
});

export const HOG_MAMA = Object.freeze({
  height: 1.68,
  build: 1.20,
  dress: 'shirt',
  shirt: 0x3a2a2a,
  shirtAccent: 0xd8c48c,
  hairColour: 0x2a1c14,
  skin: 0xd9a97f,
  gender: 'female',
  bodyShape: 'curvy',
  luxury: true,
  watch: 'gold',
});

export const WILLY = Object.freeze({
  height: 1.70,
  build: 1.10,
  gut: 1,
  dress: 'shirt',
  shirt: 0x2e2438,
  hair: 'receding',
  hairColour: 0x5a3a20,
  beard: true,
  skin: 0xd9a97f,
  belt: 'leather',
});

export const ERIC = Object.freeze({
  height: 1.78,
  build: 1.05,
  dress: 'shirt',
  shirt: 0x24303a,
  hairColour: 0x5a3a20,
  skin: 0xe8c39c,
  trim: true,
  belt: 'leather',
  watch: 'silver',
});

export const GRATIN = Object.freeze({
  height: 1.76,
  build: 1.30,
  dress: 'shirt',
  shirt: 0x3a3320,
  hairColour: 0x2a1c14,
  skin: 0xd9a97f,
  belt: 'leather',
});

export const IRISH = Object.freeze({
  height: 1.78,
  build: 1.15,
  dress: 'shirt',
  shirt: 0x1f2b22,
  hair: 'short',
  hairColour: 0x8a5a2a,
  beard: true,
  skin: 0xf0cba6,
  belt: 'leather',
});

/**
 * Sauce, who is in the whites wherever you find him.
 *
 * The body is not new — it is the man already working the buffet at the
 * closed party in `src/bing/hotdog-party.js`, moved here verbatim so the
 * floor of the club and the party are the same person rather than two men
 * with one nickname. `chef` is the wardrobe's whole argument about him: he
 * brings his own food into a nightclub, and he does not change to come out.
 */
export const SAUCE = Object.freeze({
  height: 1.72,
  build: 1.08,
  dress: 'chef',
  shirt: 0xe7e2d6,
  hair: 'short',
  hairColour: 0x241913,
  skin: 0xe8c39c,
});

export const AUBBIE = Object.freeze({
  height: 1.77,
  build: 1.05,
  dress: 'work',
  shirt: 0x24292c,
  hair: 'short',
  hairColour: 0x8a3e20,
  beard: true,
  skin: 0xd7a67e,
  belt: 'leather',
});

/**
 * The Bada Bing's bartender.
 *
 * He was typed inline in `populate()` in src/bing/cast.js and nowhere else,
 * which was fine right up until a second scene needed him — Lou's mansion has
 * a bar in the billiard bay and it is THIS man working it, not a new one. So
 * his body moves here, both places spread it, and there is one bartender.
 *
 * The waistcoat is the whole read: he is the only person in either building
 * dressed by an employer rather than by himself.
 */
export const BADA_BING_BARTENDER = Object.freeze({
  height: 1.70,
  build: 1.00,
  dress: 'waistcoat',
  shirt: 0xd8d4cc,
  hair: 'tied',
});

/* ------------------------------------------------------------------------ *
 * LOU'S SECURITY
 *
 * Not Family. Hired, uniformed, and paid to be unpleasant — so they are
 * dressed as a UNIT and the unit is the point: one suit, one shirt colour,
 * one belt, one watch, and the watch is silver. Lou wears every expensive
 * thing at once and his men wear none of it, which is the clearest thing the
 * wardrobe can say about who these people are to him.
 *
 * `trim` is on for all of them despite the note at the top of this file about
 * it not being free: the player is stopped by one of these men at the front
 * door and talks to another one beside a hanging body. They are stood next
 * to, so they get collars.
 * ------------------------------------------------------------------------ */

/** Everything every one of Lou's men has in common. Spread, never restated. */
const SECURITY_UNIFORM = Object.freeze({
  dress: 'suit',
  shirt: 0x191c22,
  shirtAccent: 0x9aa2ae,
  trim: true,
  belt: 'leather',
  trouserFit: 'creased',
  watch: 'silver',
});

/**
 * The man on the front door.
 *
 * Owner: *"This guy is deadly serious and doesn't want any funny business."*
 * The same uniform as the rest, one grade sharper — he is the biggest of them
 * and he is the one with the earpiece's worth of authority, because he is the
 * only one who is allowed to turn you around.
 */
export const MANSION_DOOR_MAN = Object.freeze({
  ...SECURITY_UNIFORM,
  height: 1.92,
  build: 1.42,
  hair: 'bald',
  skin: 0xb87a4e,
});

/**
 * The six men on the rest of the house, in the order the mansion posts them:
 * three walking the perimeter outside, one at the top of the horseshoe stair,
 * one in the basement, one on the vault.
 *
 * They differ only in the four things a uniform cannot hide — height, build,
 * hair and skin — so they read as six men in the same suit rather than six
 * copies of one man or six unrelated people who happen to match.
 */
export const MANSION_GUARDS = Object.freeze([
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.86, build: 1.22, hair: 'short', hairColour: 0x1c1410, skin: 0xd9a97f }),
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.78, build: 1.34, hair: 'crop', hairColour: 0x4a3a2a, skin: 0xe8c39c }),
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.90, build: 1.10, hair: 'short', hairColour: 0x2a1c14, skin: 0x8d5a3a, beard: true }),
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.81, build: 1.28, hair: 'bald', skin: 0xf0cba6 }),
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.75, build: 1.40, hair: 'short', hairColour: 0x14100e, skin: 0xc08a5e }),
  Object.freeze({ ...SECURITY_UNIFORM, height: 1.88, build: 1.16, hair: 'crop', hairColour: 0x8a5a2a, skin: 0xf0cba6, beard: true }),
]);

/**
 * Everyone above, by the `CHARACTER_IDS` key the campaign uses, so a scene can
 * dress a roster it is iterating rather than naming each import.
 */
/* Keyed by CHARACTER id, so the scene variants above are deliberately NOT in
 * here -- `lou` is a person and `lou_bing` is an outfit, and a map that mixed
 * the two would be the drift this file exists to stop. A scene that wants the
 * variant imports it by name. */
export const WARDROBE = Object.freeze({
  lou: BIG_UNCLE_LOU,
  captain_lou_sasole: CAPTAIN_LOU_SASOLE,
  booski: BOOSKI,
  deathmegatron: DEATHMEGATRON,
  snow: SNOW,
  shubenator: SHUBENATOR,
  rippinflow: RIPPINFLOW,
  numbskull: NUMBSKULL,
  hogmama: HOG_MAMA,
  willy: WILLY,
  eric: ERIC,
  gratin: GRATIN,
  irish: IRISH,
  aubbie: AUBBIE,
  sauce: SAUCE,
});

/** The canonical model for a character id, or null for anyone not on it. */
export function wardrobeFor(characterId) {
  return WARDROBE[characterId] ?? null;
}
