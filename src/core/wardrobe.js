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
 *
 * The hat is BLACK -- `0x4a3c2c` was a brown felt sitting on top of a suit
 * built entirely out of blacks and charcoals, and it read as a mismatched
 * accessory rather than as part of the outfit. A near-black rather than a
 * literal `0x000000` so the crown still takes a highlight under the club's
 * one warm bulb instead of drawing as a flat silhouette.
 */
export const BIG_UNCLE_LOU_BING = Object.freeze({
  ...BIG_UNCLE_LOU,
  pinstripe: true,
  threePiece: true,
  hat: 'fedora',
  hatColour: 0x121114,
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

/**
 * The return from the Enola, when home is a briefing room again.
 *
 * This is not the Bing owner's chalk stripe and fedora, and it is not the
 * camp shirt from the quiet house visit. The oxblood-charcoal suit is sober
 * enough for bad news, with a cream shirt, black tie and no decorative square.
 * His body, watch, chain and corno stay exactly the same.
 */
export const BIG_UNCLE_LOU_MANSION_RETURN = Object.freeze({
  ...BIG_UNCLE_LOU,
  dress: 'suit',
  shirt: 0x32252a,
  shirtAccent: 0xeadfc8,
  jacketColour: 0x32252a,
  trouserColour: 0x242329,
  tieColour: 0x0c0b0e,
  pocketSquare: false,
  trim: true,
  neckline: false,
  hat: false,
  pinstripe: false,
  threePiece: false,
  pattern: false,
  patches: false,
  workVest: false,
  tuxedo: false,
  argyle: null,
  knickers: false,
  barefoot: false,
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

/**
 * NO WAKE, where he is spending an afternoon on Lou's boat rather than
 * holding court at the Bing.
 *
 * Same man and the same old-money jewellery, but without the knit and gold
 * ribbing he wears in the club: an open short-sleeve slate camp shirt over a
 * white tee, warm stone trousers, a leather belt and plain dark shoes. The
 * canonical neckline/luxury flags are explicitly cleared because those build
 * real V-neck and rib geometry; leaving either one behind would put the club
 * shirt through the open boat shirt.
 */
export const BOOSKI_NO_WAKE = Object.freeze({
  ...BOOSKI,
  dress: 'camp',
  shirt: 0x315b63,
  shirtAccent: null,
  trouserColour: 0x8b8068,
  neckline: false,
  luxury: false,
  trim: false,
  belt: 'leather',
  trouserFit: 'plain',
  pattern: false,
  barefoot: false,
  hat: false,
  pinstripe: false,
  threePiece: false,
  patches: false,
  workVest: false,
  argyle: null,
  knickers: false,
  shoeStyle: 'plain',
});

/**
 * Boss, not crew — and not the men's jewellery box.
 *
 * The first pass put her in the founders' own vocabulary literally: the same
 * layered gold rope, the same crest medallion, the same watch the men wear.
 * Owner's note: she is a woman, and a pile of gold chains and a watch is the
 * MEN's way of saying "senior" on this roster, not hers. So the tailoring
 * stays — `trim` and `luxury` are what actually mark her as elevated above
 * the rank and file, the same two flags Lou and Booski carry and the ordinary
 * floor regulars do not — and the jewellery comes off rather than getting
 * reassigned to a smaller version of itself.
 *
 * Owner, second pass (2026-08-13): put her in a dress. `dress: 'gown'` is the
 * same skirt-and-bodice build the Silver Room already dresses Margo and its
 * diners in — a garment the roster owns, not one invented for her. What keeps
 * her herself and not a copy of Margo is everything the suit already said:
 * near-black midnight instead of colour, `luxury`'s thin gold ribbing on the
 * bodice standing in for the jewellery she still does not wear, the gold belt
 * cinching the gown at the bodice/skirt seam where a waistband used to sit,
 * and a wide structured strap (`gownStrapWidth`) built rather than a thin one
 * slipped into. `docs/OUTCOMES-AND-NPCS.md`'s read on her does not move: THE
 * MUSCLE, "few words, all physical." She is exactly that in a dress, which is
 * the point of playing it straight rather than hedging it.
 */
export const DEATHMEGATRON = Object.freeze({
  height: 1.79,
  build: 1.12,
  gender: 'female',
  bodyShape: 'curvy',
  dress: 'gown',
  gownStrapWidth: 0.058,
  shirt: 0x1a1d2a,
  shirtAccent: 0xc7a66a,
  hair: 'tied',
  hairColour: 0x14100e,
  skin: 0xc08a5e,
  luxury: true,
  trim: true,
  belt: 'gold',
});

/**
 * THE TAKE: mission clothes under the plate carrier, not an evening gown
 * intersecting it. Midnight-navy utility shirt, charcoal tactical trousers
 * and dark practical hardware; same woman, build, face and tied hair.
 */
export const DEATHMEGATRON_HEIST = Object.freeze({
  ...DEATHMEGATRON,
  dress: 'shirt',
  shirt: 0x18273d,
  shirtAccent: 0x8793a0,
  trouserColour: 0x292c32,
  gownStrapWidth: 0.03,
  neckline: false,
  luxury: false,
  trim: true,
  belt: 'leather',
  trouserFit: 'plain',
  workVest: false,
  pattern: false,
  patches: false,
  tuxedo: false,
  threePiece: false,
  pinstripe: false,
  hat: false,
  argyle: null,
  knickers: false,
  barefoot: false,
  shoeStyle: 'plain',
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

/**
 * SNOW ON THE MAINTENANCE JOB — the morning after the siege.
 *
 * Owner playtest, verbatim: *"Maybe Snow is working on it as a maintenance
 * man -- lets give him a maintenance outfit and a voice line about how long
 * its going to take to get everything fixed up."*
 *
 * It is the same man, so it is the same figure: his height, his build, his
 * grey hair and his skin are taken straight off `SNOW` rather than retyped,
 * and only the clothes change. Coverall blue top AND bottom -- one colour
 * head to foot is the whole reason a coverall reads as a coverall and not as
 * a shirt somebody tucked in -- a hi-vis work vest over it, and the flat cap
 * a man wears when he is under something all day.
 */
export const SNOW_MAINTENANCE = Object.freeze({
  ...SNOW,
  shirt: 0x35506e,
  trouserColour: 0x35506e,
  workVest: true,
  workVestColour: 0xc4922c,
  hat: 'flatcap',
  hatColour: 0x2b4058,
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

/**
 * THE TAKE: a deep-plum collared driving shirt and charcoal trousers beneath
 * the driver's plate carrier. His thin silver chain and watch stay on him;
 * those are identity, not mission kit.
 */
export const RIPPINFLOW_HEIST = Object.freeze({
  ...RIPPINFLOW,
  dress: 'shirt',
  shirt: 0x43263d,
  shirtAccent: 0xb8b2b8,
  trouserColour: 0x292a2f,
  neckline: false,
  luxury: false,
  trim: true,
  trouserFit: 'creased',
  workVest: false,
  pattern: false,
  patches: false,
  tuxedo: false,
  threePiece: false,
  pinstripe: false,
  hat: false,
  argyle: null,
  knickers: false,
  barefoot: false,
  shoeStyle: 'plain',
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

/**
 * The other prospect, dressed for a thing nobody described to her.
 *
 * SHE. Corrected 2026-08-20 on the owner's ruling, and the correction is the
 * point of the character rather than a courtesy: Kittenboss is a real, newish
 * member of the club, and the whole fourth-wall gag is that the sweetest
 * person the owner knows gets driven out in a boot, kneels in the mud with
 * the rest of the prospects and does not make it. That joke does not land off
 * a man. This model was built male on the day the Special Meeting was written
 * -- `hair: 'short'`, no `gender`, no `bodyShape`, so `makePerson` gave her
 * the 0.226 male shoulder frame and the hard-edged slabs -- and every one of
 * those three fields is now the other thing. The manifest has had a woman's
 * ElevenLabs id on `voices.kittenboss` since she was cast, so the body was
 * the last place she was still being drawn as a bloke.
 *
 * She was told to put on something decent, the same as Tony was, and she did:
 * a shirt with a collar, a belt, and shoes she does not wear to anything else.
 * `trim` is on -- she is one of two people the player stands beside for the
 * whole last act, so she earns the buttons and the placket. What the fitting
 * room cannot show, because it is not clothing, is that all of it is extremely
 * creased. She has been lying on a spare wheel.
 *
 * ## `neckline: 'collar'` was never a value, and it was cancelling the collar
 *
 * The model shipped with `neckline: 'collar'` sitting under `trim: true`, and
 * it read like the obvious way to ask for a collar. It is not on the option
 * list -- `src/bing/cast.js` documents `neckline` as `false | 'v'` and draws
 * nothing for anything else -- and worse, the placket branch is guarded on
 * `!neckline`, so the one truthy string switched OFF the placket, the buttons
 * and the collar it was asking for. She has been standing on that block in a
 * flat coloured torso since the day the scene was written. The field is gone
 * and `trim` now does what the line above it always claimed: a real placket, a
 * real collar, the shirt she was told to put on. This is the same read Tony
 * gets in the seat next to her, which is the whole staging.
 *
 * ## The numbers deliberately did not move
 *
 * `height: 1.79` and `build: 1.06` are the same two numbers this model shipped
 * with, and they stay. She is the same age and the same rank as Tony and she
 * stands eye to eye with him, which is the read the scene needs: she is not
 * small, not cute, not a victim and not comic relief. She is completely
 * unbothered, and she is more annoyed about the spare wheel than about the
 * boot. Shrinking her to signal "woman" would have thrown away the only thing
 * the staging has -- two prospects, the same size problem, on the same night.
 * DEATHMEGATRON is 1.79 on this same roster for the same reason.
 *
 * `gender: 'female'` narrows the shoulder frame and `bodyShape: 'curvy'` gives
 * the hips and the chamfered slabs; the pair of them is how every woman on
 * this roster is built (see HOG_MAMA, DEATHMEGATRON), and `makePerson` gates
 * the performer figure on the bikini rather than on `curvy`, so nothing from
 * the Silver Room's stage roles comes with them. `hair: 'tied'` replaces
 * `'short'` so her silhouette remains readable at ten metres, in the dark,
 * under one dome light and a boot bulb; the landed portrait reinforces that
 * identity up close. It also earns its keep on the gag -- that is hair that
 * has spent forty-two minutes against a spare wheel.
 *
 * Deliberately NOT luxury and deliberately no chain: the men in the front of
 * the car have both. She is what a prospect owns.
 */
export const KITTENBOSS = Object.freeze({
  height: 1.79,
  build: 1.06,
  gender: 'female',
  bodyShape: 'curvy',
  dress: 'shirt',
  shirt: 0x8d94a4,
  trim: true,
  hair: 'tied',
  hairColour: 0x241a12,
  skin: 0xdcae86,
  belt: 'leather',
});

/**
 * The matriarch. Luxury finish, no watch -- owner's note: the men on this
 * roster wear one, the women do not, and a gold watch was never the thing
 * that said "runs the place" about her anyway. `docs/OUTCOMES-AND-NPCS.md`
 * has her running logistics on everything including the murders; that reads
 * off the shirt and the posture, not off her wrist.
 */
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
 * NO WAKE: the lookout dresses for spray and wind. A weatherproof navy deck
 * vest sits open over his green shirt, with dark trousers and laced dark shoes
 * that read as deck boots. His body, red hair and beard do not change.
 */
export const IRISH_NO_WAKE = Object.freeze({
  ...IRISH,
  dress: 'shirt',
  shirt: 0x29402f,
  shirtAccent: 0x9ca8a0,
  trouserColour: 0x20242a,
  neckline: false,
  luxury: false,
  trim: true,
  workVest: true,
  workVestColour: 0x1b304c,
  trouserFit: 'plain',
  pattern: false,
  patches: false,
  tuxedo: false,
  threePiece: false,
  pinstripe: false,
  hat: false,
  argyle: null,
  knickers: false,
  barefoot: false,
  shoeStyle: 'plain',
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

/**
 * Aubbie, who is a SCIENTIST.
 *
 * He used to wear `dress: 'work'` with a beard and ginger hair, which reads as
 * the man who fixes the microphone cable — and the campaign has established
 * him as something else entirely. `src/mansion/scenes/SilentSquatch.js` puts
 * him at the head of Lou's programme in a lab coat, shirt and tie, the only
 * one of the six with a tie showing: coat `0xe2e0d6`, shirt `0xdad8cc`, tie
 * `0x4a2028`, hair `0x3a3630`, skin `0xc0956e`, and a height of 1.77 that was
 * taken FROM this file in the first place so the two Aubbies would be one man.
 * They were one man everywhere except his clothes. Owner, 2026-08-19.
 *
 * On the club rig a lab coat is a `suit` in coat colours: `shirt` is the
 * garment's own body, `jacketColour` its lapels and sleeves, and `shirtAccent`
 * the shirt showing at the front and on the collar points. `trim` is what
 * turns that into a knotted tie, a collar and buttons rather than a pale
 * rectangle, and he earns it — the Prospect stands in front of him twice in
 * the cleanup. No pocket square: nothing about this man is decorative. Dark
 * trousers under the coat, because a suit's trousers otherwise take the
 * jacket colour and he would be white from the collar down.
 *
 * The mansion builds its own figures on a different rig (`Figure`), so it
 * takes none of this — which is exactly why the two drifted. Anything that
 * dresses Aubbie on the club rig takes it from here.
 */
export const AUBBIE = Object.freeze({
  height: 1.77,
  build: 1.06,
  dress: 'suit',
  shirt: 0xe2e0d6,
  jacketColour: 0xe2e0d6,
  shirtAccent: 0xdad8cc,
  tieColour: 0x4a2028,
  trouserColour: 0x2b2d33,
  trim: true,
  pocketSquare: false,
  hair: 'short',
  hairColour: 0x3a3630,
  skin: 0xc0956e,
});

/**
 * James Blond, tied to a chair in the Bing's store room.
 *
 * The one tuxedo on the roster, which is exactly why the collision between
 * `dress: 'suit'` and `tuxedo: true` in `makePerson` went unnoticed for as
 * long as it did — see the `!tuxedo` gate in `src/bing/cast.js`. `barefoot`
 * is NOT here: it belongs to `src/bing/license-to-grill-runtime.js`, which
 * adds it on top of this model, because it is true of this SCENE — whoever
 * tied him to the chair took his shoes — and not true of the man.
 */
export const JAMES_BLOND = Object.freeze({
  height: 1.83,
  build: 1.0,
  dress: 'suit',
  shirt: 0x14161f,
  shirtAccent: 0xf0efe8,
  tuxedo: true,
  luxury: true,
  hair: 'short',
  hairColour: 0xd8c088,
  skin: 0xf0cba6,
  bowtie: true,
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
 * The man in the booth at the street gate.
 *
 * Owner playtest: *"ADD a guard working that booth"*. He is on the same
 * `mansion-gate` throat as the man on the door (see `SPEAKERS.BOOTH` in
 * src/mansion/script.js) and he is deliberately NOT one of `MANSION_GUARDS`:
 * those six are posted elsewhere in the house and reusing one of their bodies
 * would put the same man in two places on the same walk. Older and heavier
 * than the walkers, because a gate booth is the post you get given after
 * twenty years of walking the fence.
 */
export const MANSION_BOOTH_MAN = Object.freeze({
  ...SECURITY_UNIFORM,
  height: 1.80,
  build: 1.46,
  hair: 'crop',
  hairColour: 0x8e8b86,
  skin: 0xdcb188,
  beard: true,
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
  james_blond: JAMES_BLOND,
  kittenboss: KITTENBOSS,
});

/** The canonical model for a character id, or null for anyone not on it. */
export function wardrobeFor(characterId) {
  return WARDROBE[characterId] ?? null;
}
