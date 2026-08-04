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
 *   None of it is subtle and none of it is meant to be.
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
  shirt: 0x20242c,
  shirtAccent: 0xe8e2d2,
  hairColour: 0x17110d,
  skin: 0xd7a67e,
  luxury: true,
  trim: true,
  belt: 'gold',
  trouserFit: 'creased',
  watch: 'gold',
  chain: true,
  pendant: true,
  pendantStyle: 'crest',
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
 * Everyone above, by the `CHARACTER_IDS` key the campaign uses, so a scene can
 * dress a roster it is iterating rather than naming each import.
 */
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
});

/** The canonical model for a character id, or null for anyone not on it. */
export function wardrobeFor(characterId) {
  return WARDROBE[characterId] ?? null;
}
